#!/usr/bin/env node
import { Tool, OllamaAgent } from './ollama.mjs'
import { generate as genCharacter } from './generators/character/index.mjs'
import { generate as genAnimal } from './generators/animal/index.mjs'
import { generate as genThing } from './generators/thing/index.mjs'
import { generate as genLocation } from './generators/location/index.mjs'
import { generate as genStyle } from './generators/style/index.mjs'
import { generate as genSubject } from './generators/subject/index.mjs'
import { generate as genTheme } from './generators/theme/index.mjs'
import fs from 'fs'

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

const raw = parseArgs(process.argv.slice(2));
const model = raw.model || 'qwen2.5vl';
const pages = Number(raw.pages || raw.p) || 8;
const outFile = raw.out || raw.o || 'story_output.json';
const verbose = Boolean(raw.verbose || raw.v);

const characterTool = new Tool({
  name: 'generate_character',
  description: 'Generate one or more human characters for a children\'s story. Each character gets a name, appearance, clothing, demeanor, and backstory.',
  parameters: {
    type: 'object',
    properties: {
      names: {
        type: 'string',
        description: 'Optional comma-separated list of character names to use. If omitted, random names are chosen.',
      },
      count: {
        type: 'integer',
        description: 'Number of characters to generate (default 1, max 5). Ignored if names are provided.',
        default: 1,
      },
    },
  },
  async execute({ names, count }) {
    const out = [];
    if (names && typeof names === 'string') {
      for (const n of names.split(',').map(s => s.trim()).filter(Boolean)) {
        out.push(genCharacter(n));
      }
    } else {
      const n = Math.min(Math.max(1, Number(count) || 1), 5);
      for (let i = 0; i < n; i++) out.push(genCharacter());
    }
    return out;
  },
})

const animalTool = new Tool({
  name: 'generate_animal',
  description: 'Generate a cute, kid-friendly animal for a children\'s story. Returns a description with animal type (rabbit, fox, bear cub, etc.), appearance, personality, and special ability. The model must derive a name from the description.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        description: 'Number of animals to generate (default 1, max 5).',
        default: 1,
      },
    },
  },
  async execute({ count }) {
    const n = Math.min(Math.max(1, Number(count) || 1), 5);
    const out = [];
    for (let i = 0; i < n; i++) out.push(genAnimal());
    return out;
  },
})

const thingTool = new Tool({
  name: 'generate_thing',
  description: 'Generate a magical object or special item for a children\'s story. Returns a description with item type (crystal, amulet, music box, etc.), magical property, and origin story. The model must derive a name from the description.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        description: 'Number of things to generate (default 1, max 5).',
        default: 1,
      },
    },
  },
  async execute({ count }) {
    const n = Math.min(Math.max(1, Number(count) || 1), 5);
    const out = [];
    for (let i = 0; i < n; i++) out.push(genThing());
    return out;
  },
})

const locationTool = new Tool({
  name: 'generate_location',
  description: 'Generate a story setting/location description including visual details, sounds, smells, atmosphere, and special features.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        description: 'Number of locations to generate (default 1, max 3).',
        default: 1,
      },
    },
  },
  async execute({ count }) {
    const n = Math.min(Math.max(1, Number(count) || 1), 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(genLocation());
    return out;
  },
})

const styleTool = new Tool({
  name: 'generate_style',
  description: 'Generate an illustration art style description including art media, color palette, texture, and mood.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        description: 'Number of styles to generate (default 1, max 3).',
        default: 1,
      },
    },
  },
  async execute({ count }) {
    const n = Math.min(Math.max(1, Number(count) || 1), 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(genStyle());
    return out;
  },
})

const subjectTool = new Tool({
  name: 'generate_subject',
  description: 'Generate a story premise or subject — the core magical element, conflict, stakes, and happy resolution.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        description: 'Number of subjects to generate (default 1, max 3).',
        default: 1,
      },
    },
  },
  async execute({ count }) {
    const n = Math.min(Math.max(1, Number(count) || 1), 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(genSubject());
    return out;
  },
})

const themeTool = new Tool({
  name: 'generate_theme',
  description: 'Generate a story theme or moral lesson for a children\'s story.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        description: 'Number of themes to generate (default 1, max 3).',
        default: 1,
      },
    },
  },
  async execute({ count }) {
    const n = Math.min(Math.max(1, Number(count) || 1), 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(genTheme());
    return out;
  },
})

const tools = [
  characterTool,
  animalTool,
  thingTool,
  locationTool,
  styleTool,
  subjectTool,
  themeTool,
]

const systemPrompt = `You are a creative children's story author. Your job is to write a complete, emotionally satisfying children's picture book story.

You have tools to generate story elements procedurally. Use them whenever you need inspiration or specific elements:

- **generate_character** — Create human child or adult characters with names, appearances, and personalities.
- **generate_animal** — Get a description of a cute, kid-friendly animal (rabbit, fox, bear cub, etc.) with appearance, personality, and a special ability. Derive a name for it yourself.
- **generate_thing** — Get a description of a magical object or special item (crystal, amulet, music box, etc.) with a property and origin. Derive a name for it yourself.
- **generate_location** — Create vivid story settings with sights, sounds, smells, and atmosphere.
- **generate_style** — Create illustration art style descriptions (media, palette, texture, mood).
- **generate_subject** — Create a story premise combining a magical element, conflict, stakes, and happy resolution.
- **generate_theme** — Create a moral lesson or theme for the story.

STORYTELLING WORKFLOW:
1. Call the tools you need to gather story elements. You don't have to use every tool — pick what fits the story you want to tell.
2. Weave the generated elements into a ${pages}-page children's story.
3. Output ONLY valid JSON matching the schema below. No markdown, no code fences, no extra text.

OUTPUT SCHEMA:
{
  "styleAddOn": "string — the art style description for illustrations",
  "characters": [
    { "name": "string", "description": "string — full character description" }
  ],
  "animals": [ (OPTIONAL — include if animals are in the story)
    { "name": "string", "description": "string" }
  ],
  "things": [ (OPTIONAL — include if magical items/objects are in the story)
    { "name": "string", "description": "string" }
  ],
  "target_age": [number, number],
  "theme": "string — the moral or theme",
  "front_cover": {
    "title": "string",
    "subtitle": "string",
    "image_Prompt": "string"
  },
  "pages": [
    {
      "page": number,
      "subtitle": "string — 1-2 complete sentences with dialogue. Describe what happens on this page.",
      "image_Prompt": "string",
      "characters": [ { "name": "string", "in_scene": "string" } ],
      "animals": [ (OPTIONAL) { "name": "string", "in_scene": "string" } ],
      "things": [ (OPTIONAL) { "name": "string", "in_scene": "string" } ]
    }
  ],
  "back_cover": { "image_prompt": "string" }
}

STORY STRUCTURE:
- FIRST THIRD (BEGINNING): Introduce the main character(s), establish the setting, reveal their desire or problem.
- MIDDLE THIRD (RISING ACTION): Introduce obstacles, challenges, or unexpected events. Build tension.
- FINAL THIRD (CLIMAX & RESOLUTION): Show the turning point and a happy, satisfying conclusion.

PAGE RULES:
- Each subtitle must be 1-2 complete sentences advancing the story. Include dialogue in quotation marks.
- Per-page characters array: list human characters VISIBLE on that page by name, with an in_scene field describing their pose/action/emotion.
- Per-page animals array: list animal characters VISIBLE on that page by name, with an in_scene field. Use this array (not the characters array) for animals.
- Per-page things array: list magical items/objects present or used on that page, with an in_scene field describing how the item is being used or its state.
- Animals and things should drive the plot, not just appear. An animal's special ability or a thing's magical property should be central to the story's conflict and resolution.
- Weave locations and style into each image_Prompt naturally.
- Generate exactly ${pages} pages with varied, creative content.
- Return ONLY the JSON object — no explanation, no markdown, no code fences.`

const userPrompt = `Write a ${pages}-page children's picture book story. Use the available tools to generate the story elements (characters, animals, magical things, locations, style, subject, and theme) as you see fit. Be creative! You decide which tools to call and how many times.`

if (verbose) {
  console.log(`\n[CONFIG] model=${model}, pages=${pages}, out=${outFile}\n`)
}

const agent = new OllamaAgent({
  model,
  system: systemPrompt,
  tools,
})

console.log(`Generating story with ${pages} pages using ${model}...\n`)

const result = await agent.chat({
  prompt: userPrompt,
})

console.log('\n')

function repairJSON(text) {
  let s = String(text);
  try { JSON.parse(s); return s; } catch (_) {}
  s = s.replace(/"\s*\n\s+"/g, '",\n"');
  s = s.replace(/}\s*\n\s+"/g, '},\n"');
  s = s.replace(/]\s*\n\s+"/g, '],\n"');
  s = s.replace(/}\s*\n\s+\{/g, '},\n{');
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

const repaired = repairJSON(result);
const parsed = extractJSON(repaired);

if (parsed) {
  const storyTitle = String(parsed.front_cover?.title || 'story');
  const fileName = toFilename(storyTitle) + '.json';
  let finalOutFile = outFile.endsWith('.json') ? outFile : `${outFile.replace(/\/$/, '')}/${fileName}`;
  fs.writeFileSync(finalOutFile, JSON.stringify(parsed, null, 2), 'utf8');
  console.log(`Story written to ${finalOutFile}`);
} else {
  const fallbackFile = `story_agent_failed_${Date.now()}.json`;
  fs.writeFileSync(fallbackFile, JSON.stringify({ raw: result }, null, 2), 'utf8');
  console.log(`Could not extract JSON. Raw output written to ${fallbackFile}`);
}
