#!/usr/bin/env node
import fs from 'fs';
import { spawn } from 'child_process';
import { generate as genSubject } from './generators/subject/index.mjs';
import { generate as genCharacter } from './generators/character/index.mjs';
import { generate as genAnimal } from './generators/animal/index.mjs';
import { generate as genThing } from './generators/thing/index.mjs';
import { generate as genLocation } from './generators/location/index.mjs';
import { generate as genStyle } from './generators/style/index.mjs';
import { generate as genTheme } from './generators/theme/index.mjs';
import { validateStory } from './validator.mjs';

function toFilename(title) {
  return String(title).replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').trim() || 'story';
}

function parseArgs(argv) {
  const opts = {};
  argv.forEach((arg, i) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      opts[key] = value !== undefined ? value : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
    }
  });
  return opts;
}


function parseIntOr(def, v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : def;
}

const raw = parseArgs(process.argv.slice(2));
const pages = parseIntOr(8, raw.pages || raw.p);
const outFile = raw.out || raw.o || 'story_output.json';
const model = raw.model || 'gemma4:e2b-128k';
const verbose = Boolean(raw.verbose || raw.v);

function parseSpec(value) {
  if (value === undefined || value === true) return undefined;
  if (/^\d+$/.test(String(value))) return Number(value);
  if (String(value).includes(',')) return String(value).split(',').map(v => v.trim()).filter(Boolean);
  return value;
}

function generateMany(generator, spec) {
  if (spec === undefined) return [generator()];
  if (typeof spec === 'number') return Array.from({ length: spec }, () => generator());
  if (Array.isArray(spec)) return spec.map(s => generator(s));
  return [generator(spec)];
}

const charactersSpec = parseSpec(raw.characters || raw.character || raw.chars);
const animalsSpec = parseSpec(raw.animals || raw.animal);
const thingsSpec = parseSpec(raw.things || raw.thing);
const locationsSpec = parseIntOr(undefined, raw.locations || raw.location || raw.locs);
const styleSpec = parseIntOr(undefined, raw.style || raw.s);
const subjectSpec = parseIntOr(undefined, raw.subject || raw.sub);
const themeSpec = parseIntOr(undefined, raw.theme || raw.themes || raw.t);

const scene = {
  theme: generateMany(genTheme, themeSpec),
  style: generateMany(genStyle, styleSpec),
  subject: generateMany(genSubject, subjectSpec),
  characters: generateMany(genCharacter, charactersSpec),
  animals: generateMany(genAnimal, animalsSpec),
  things: generateMany(genThing, thingsSpec),
  locations: generateMany(genLocation, locationsSpec),
};


function buildPrompt(sceneObj, pageCount) {
  const styleAddon = Array.isArray(sceneObj.style) ? (sceneObj.style[0] || '') : (sceneObj.style || '');
  const subject = Array.isArray(sceneObj.subject) ? (sceneObj.subject[0] || '') : (sceneObj.subject || '');
  const locations = (sceneObj.locations || []).slice(0, 3).join('; ');
  const rawAge = (sceneObj && sceneObj.target_age) || '3-5';
  const ageNums = String(rawAge).match(/\d+/g);
  const targetAgeArr = ageNums ? ageNums.map(Number) : [3, 5];
  const theme = Array.isArray(sceneObj.theme) ? (sceneObj.theme[0] || '') : (sceneObj.theme || '');

  let charInfos = (sceneObj.characters || []).map(c => ({
    name: String(c.name || ''),
    description: String(c.description || ''),
  }));

  const animalInfos = (sceneObj.animals || []).filter(Boolean).map(a => String(a));

  const thingInfos = (sceneObj.things || []).filter(Boolean).map(t => String(t));

  const hasAnimals = animalInfos.length > 0;
  const hasThings = thingInfos.length > 0;

  return `Output ONLY valid JSON. No markdown, no extra text.

SCHEMA:
{
  characters: [{ name, description }],
  animals: [{ name, description }],
  things: [{ name, description }],
  target_age: [min, max],
  theme: "<string>",
  front_cover: { title, subtitle, image_Prompt },
  pages: [{ page, text, image_Prompt, ?characters[{name:"",in_scene:""}], ?animals[{name:"",in_scene:""}], ?things[{name:"",in_scene:""}] }],
  back_cover: { image_prompt }
}

RULES:
- Exactly ${pageCount} pages.
- Generate characters, animals, things as needed for the story (use provided values as inspiration).
- Each page MUST have at least one of: characters[], animals[], or things[].
- Per-page entries reference names from the corresponding top-level arrays.
- Text: about ~2 sentences with dialogue in single quotes of the story.
- image_Prompt: full scene, weave in locations.
- Story arc: beginning (setup/goal), middle (conflict), end (resolution).

INSPIRATION (use, extend, or replace as needed):
characters = ${JSON.stringify(charInfos)}
${hasAnimals ? `animals = ${JSON.stringify(animalInfos)}` : ''}
${hasThings ? `things = ${JSON.stringify(thingInfos)}` : ''}
target_age = ${JSON.stringify(targetAgeArr)}
theme = "${theme}"
subject = "${subject}"
locations = "${locations}"`;
}

function vlog(label, msg) {
  if (!verbose) return;
  try { console.log(`[${label}] ${msg}`); } catch (_) { }
}

function startSpinner(name) {
  if (!verbose) return () => {};
  const iv = setInterval(() => { process.stdout.write('.'); }, 300);
  return function stop() { clearInterval(iv); process.stdout.write('\n'); };
}


async function callOllamaCLI(prompt, model) {
  return new Promise((resolve, reject) => {
    const cp = spawn('ollama', ['generate', model, prompt]);
    let stdout = '';
    cp.stdout.on('data', (data) => {
      process.stdout.write(data);
      stdout += data;
    });
    cp.stderr.on('data', (data) => { process.stderr.write(data); });
    cp.on('error', reject);
    cp.on('close', (code) => {
      if (code !== 0) reject(new Error(`exit ${code}`));
      else resolve(stdout);
    });
  });
}


async function callOllamaHTTP(prompt, model) {
  const url = `http://localhost:11434/api/generate?stream=true&model=${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  let merged = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.response) {
          process.stdout.write(chunk.response);
          merged += chunk.response;
        }
      } catch (_) { /* skip unparseable lines */ }
    }
  }
  return merged;
}


function repairJSON(text) {
  let s = String(text);
  try { JSON.parse(s); return s; } catch (_) {}
  // Fix missing commas between key-value pairs (at newlines before a quoted key or closing brace)
  s = s.replace(/"\s*\n\s+"/g, '",\n"');
  s = s.replace(/}\s*\n\s+"/g, '},\n"');
  s = s.replace(/]\s*\n\s+"/g, '],\n"');
  // Fix missing comma after } before { on next line in arrays
  s = s.replace(/}\s*\n\s+\{/g, '},\n{');
  // Fix trailing commas
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

function extractJSON(text) {
  if (!text) return null;
  let s = String(text).replace(/^\uFEFF/, '');
  s = s.replace(/^\s*```(?:\s*\w+)?\s*/i, '');
  s = s.replace(/\s*```\s*$/i, '');
  s = s.replace(/^\s*(?:json|javascript)\s*[\r\n]+/i, '');
  const first = s.indexOf('{');
  if (first >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = first; i < s.length; i++) {
      const ch = s[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(s.slice(first, i + 1)); } catch (_) { break; }
        }
      }
    }
  }
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch (_) {}
  }
  return null;
}


async function generateOnce(promptText, attempt, styleAddonValue) {
  if (verbose && attempt > 1) {
    console.log(`\n[RETRY ATTEMPT ${attempt}] - Sending prompt again...`);
  }

  let rawOutput = null;
  if (typeof fetch === 'function') {
    try {
      process.stdout.write('\n');
      rawOutput = await callOllamaHTTP(promptText, model);
      process.stdout.write('\n');
    } catch (_) {
      rawOutput = null;
    }
  }
  if (!rawOutput) {
    try {
      process.stdout.write('\n');
      rawOutput = await callOllamaCLI(promptText, model);
      process.stdout.write('\n');
    } catch (err) {
      return { success: false, fatal: true, error: err };
    }
  }

  const repaired = repairJSON(rawOutput);
  const parsed = extractJSON(repaired);
  if (!parsed) {
    return { success: false, fatal: false, raw: rawOutput };
  }

  if (styleAddonValue) parsed.styleAddOn = String(styleAddonValue);

  const errors = validateStory(parsed);
  return {
    success: errors.length === 0,
    fatal: false,
    parsed,
    raw: rawOutput,
    errors,
  };
}

async function main() {
  const maxRetries = 2;
  const styleAddon = Array.isArray(scene.style) ? (scene.style[0] || '') : (scene.style || '');
  let basePrompt = buildPrompt(scene, pages);
  if (verbose) console.log('\n=== PROMPT ===\n' + basePrompt + '\n=== END PROMPT ===\n');
  let lastResult = null;
  let lastRawOutput = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    let currentPrompt = basePrompt;

    if (attempt > 1 && lastResult) {
      if (lastResult.errors && lastResult.errors.length > 0) {
        const errorList = lastResult.errors.map((e, i) => `${i + 1}. ${e}`).join('\n');
        currentPrompt = basePrompt + '\n\n=== PREVIOUS ATTEMPT FAILED SCHEMA VALIDATION ===\nYou returned JSON but it had these problems:\n' + errorList +
          '\n\nFIX THESE ISSUES and return ONLY valid JSON matching the required schema exactly.';
      } else if (lastResult.raw && !lastResult.parsed) {
        const rawPreview = lastResult.raw.length > 1000
          ? lastResult.raw.slice(0, 1000) + '\n... (truncated - total length: ' + lastResult.raw.length + ' chars)'
          : lastResult.raw;
        currentPrompt = basePrompt +
          '\n\n=== PREVIOUS ATTEMPT FAILED - COULD NOT EXTRACT VALID JSON ===\nThis is what you returned (first 1000 chars):\n"""\n' + rawPreview + '\n"""\n' +
          '\nYOU MUST RETURN ONLY VALID JSON. No markdown code fences, no explanation text, no extra content before or after. Just the { } JSON object.';
      }
    }

    const tokenEstimate = Math.round(currentPrompt.length / 4);
    if (verbose || attempt > 1) {
      console.log(`\n[ATTEMPT ${attempt}/${maxRetries + 1}] (~${tokenEstimate} tokens)`);
      if (attempt > 1 && lastResult?.errors) {
        console.log('Fixing validation errors:');
        lastResult.errors.forEach(e => console.log('  -', e));
      }
    }

    const result = await generateOnce(currentPrompt, attempt, styleAddon);

    if (result.fatal) {
      fs.writeFileSync('story_prompt.txt', basePrompt, 'utf8');
      console.error('Could not call Ollama. Wrote prompt to story_prompt.txt.');
      process.exit(1);
    }

    if (!result.success && result.raw) {
      lastRawOutput = result.raw;
    }

    lastResult = result;

    if (result.success) {
      const storyTitle = String(result.parsed.front_cover?.title || 'story');
      const fileName = toFilename(storyTitle) + '.json';
      let finalOutFile = outFile.endsWith('.json') ? outFile : `${outFile.replace(/\/$/, '')}/${fileName}`;
      fs.writeFileSync(finalOutFile, JSON.stringify(result.parsed, null, 2), 'utf8');
      console.log(`Story written to ${finalOutFile}`);
      return;
    }

    if (result.errors && result.errors.length > 0) {
      console.log('Schema validation warnings:\n' + result.errors.map(e => '  - ' + e).join('\n'));
    }
  }

  if (lastResult?.parsed) {
    console.log(`\nMax retries reached. Saving best result despite ${lastResult.errors?.length || 0} validation issues...`);
    const storyTitle = String(lastResult.parsed.front_cover?.title || 'story');
    const fileName = toFilename(storyTitle) + '.json';
    let finalOutFile = outFile.endsWith('.json') ? outFile : `${outFile.replace(/\/$/, '')}/${fileName}`;
    fs.writeFileSync(finalOutFile, JSON.stringify(lastResult.parsed, null, 2), 'utf8');
    console.log(`Story (with warnings) written to ${finalOutFile}`);
    return;
  }

  const fallbackFile = `output_failed_${Date.now()}.json`;
  fs.writeFileSync(fallbackFile, JSON.stringify({ raw: lastRawOutput }, null, 2), 'utf8');
  console.log(`Wrote raw output to ${fallbackFile} (could not extract valid JSON after ${maxRetries + 1} attempts).`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
