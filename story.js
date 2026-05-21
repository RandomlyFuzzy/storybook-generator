#!/usr/bin/env node
import fs from 'fs';
import { spawn } from 'child_process';
import { generate as genSubject } from './tools/subject/index.mjs';
import { generate as genCharacter } from './tools/character/index.mjs';
import { generate as genLocation } from './tools/location/index.mjs';
import { generate as genStyle } from './tools/style/index.mjs';
import { generate as genTheme } from './tools/theme/index.mjs';

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
const model = raw.model || 'gemma4:e2b';
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
const locationsSpec = parseIntOr(undefined, raw.locations || raw.location || raw.locs);
const styleSpec = parseIntOr(undefined, raw.style || raw.s);
const subjectSpec = parseIntOr(undefined, raw.subject || raw.sub);
const themeSpec = parseIntOr(undefined, raw.theme || raw.themes || raw.t);

const scene = {
  theme: generateMany(genTheme, themeSpec),
  style: generateMany(genStyle, styleSpec),
  subject: generateMany(genSubject, subjectSpec),
  characters: generateMany(genCharacter, charactersSpec),
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

  const charInfos = (sceneObj.characters || []).map(c => ({
    name: String(c.name || ''),
    description: String(c.description || ''),
  }));

  return `Output ONLY valid JSON that matches this schema exactly. No surrounding text, no markdown, no explanation.

Required top-level keys:
- styleAddOn (string)
- characters (array of { name: string, description: string }) - all main characters in the story (full descriptions)
- target_age (array of numbers, e.g. [3, 5])
- theme (string)
- front_cover (object: { title: string, subtitle: string, image_Prompt: string })
- pages (array of ${pageCount} objects, each with: { page: number, subtitle: string, image_Prompt: string, characters: array of { name: string, in_scene: string } })
  - NOTE: Page characters array: ONLY use name of characters shown (from top-level list), and 'in_scene' describes what they're DOING/FEELING/ACTING in this specific scene. Example: { "name": "Olympia", "in_scene": "standing nervously at the entrance, clutching her postcard tightly, eyes wide with hesitation" }
- back_cover (object: { image_prompt: string })

Use these exact values for the corresponding keys:
  styleAddOn = "${styleAddon}"
  characters = ${JSON.stringify(charInfos)}
  target_age = ${JSON.stringify(targetAgeArr)}
  theme = "${theme}"
  subject = "${subject}"
  locations (weave into page image_Prompt values) = "${locations}"

Story Structure Rules (IMPORTANT - follow exactly):
1. FIRST THIRD of pages (BEGINNING): Introduce the main character, establish the setting/location, and reveal the character's desire, goal, or problem. Show their normal life and what they hope for.
2. MIDDLE THIRD of pages (RISING ACTION & CONFLICT): Introduce an obstacle, challenge, or unexpected event that complicates things. Build tension as the character tries to overcome difficulties.
3. FINAL THIRD of pages (CLIMAX & RESOLUTION): Show the turning point where the character succeeds or learns something important. End with a satisfying, happy conclusion that shows growth or a reward.

Page Content Rules:
- Each page's subtitle MUST be 1-2 complete sentences describing the key action, dialogue, or emotion of that page. Do NOT use short phrases. Tell what happens on this page.
- Include character speech/dialogue with quotation marks whenever characters speak. Dialogue makes the story feel alive! Example: "Come inside," whispered Mia, "the fort has glowing secrets waiting for us."
- Each page's subtitle must advance the story. Example good subtitle: "Olympia hesitated at the fort's dark entrance, clutching her lucky postcard while a soft glow flickered from within. 'Are you sure about this?' she called out to her invisible friend."
- Each page's characters array: ONLY list characters VISIBLE on that page, by NAME (from the top-level characters list), plus an 'in_scene' field that describes WHAT THEY ARE DOING in this specific moment - their pose, action, expression, posture. DO NOT repeat their full character description. Good example: { "name": "Olympia", "in_scene": "crouching down to peek inside, one hand covering her mouth in surprise" }. Bad example: { "name": "Olympia", "in_scene": "There stood Olympia Vaughn with gumboots..." } (repeating full desc)
- Weave the locations naturally into each image_Prompt based on what happens in the scene.
- Generate ${pageCount} pages with varied, creative content that tells a complete, emotionally satisfying story.
- Return ONLY the JSON object — no markdown, no code fences, no explanation.`;
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

function validateStory(obj) {
  let schema = null;
  try {
    const schemaRaw = fs.readFileSync('story.schema.json', 'utf8');
    schema = JSON.parse(schemaRaw);
  } catch (_) { return []; }
  const errors = [];
  function check(obj, schema, path) {
    if (schema.type === 'object' && schema.required) {
      for (const key of schema.required) {
        if (obj[key] === undefined || obj[key] === null) {
          errors.push(`${path}.${key} is required`);
        }
      }
      if (schema.properties) {
        for (const key of Object.keys(schema.properties)) {
          if (obj[key] !== undefined) {
            check(obj[key], schema.properties[key], `${path}.${key}`);
          }
        }
      }
    }
    if (schema.type === 'array' && Array.isArray(obj)) {
      if (schema.minItems && obj.length < schema.minItems) {
        errors.push(`${path} has fewer than ${schema.minItems} items`);
      }
      if (schema.items) {
        for (let i = 0; i < obj.length; i++) {
          check(obj[i], schema.items, `${path}[${i}]`);
        }
      }
    }
    if (schema.type === 'string' && typeof obj !== 'string') {
      errors.push(`${path} should be a string`);
    }
    if (schema.type === 'integer' && !Number.isInteger(obj)) {
      errors.push(`${path} should be an integer`);
    }
    if (Array.isArray(schema.type) && !schema.type.includes(typeof obj) && !(schema.type.includes('null') && obj === null)) {
      errors.push(`${path} should be one of: ${schema.type.join(', ')}`);
    }
  }
  check(obj, schema, '$');
  return errors;
}

async function generateOnce(promptText, attempt) {
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
  let basePrompt = buildPrompt(scene, pages);
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

    if (verbose || attempt > 1) {
      console.log(`\n[ATTEMPT ${attempt}/${maxRetries + 1}]`);
      if (attempt > 1 && lastResult?.errors) {
        console.log('Fixing validation errors:');
        lastResult.errors.forEach(e => console.log('  -', e));
      }
    }

    const result = await generateOnce(currentPrompt, attempt);

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
      const encodedTitle = encodeURIComponent(storyTitle) + '.json';
      let finalOutFile = outFile.endsWith('.json') ? outFile : `${outFile.replace(/\/$/, '')}/${encodedTitle}`;
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
    const encodedTitle = encodeURIComponent(storyTitle) + '.json';
    let finalOutFile = outFile.endsWith('.json') ? outFile : `${outFile.replace(/\/$/, '')}/${encodedTitle}`;
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
