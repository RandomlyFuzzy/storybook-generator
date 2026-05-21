import { generate as genSubject } from './tools/subject/index.mjs';
import { generate as genCharacter } from './tools/character/index.mjs';
import { generate as genLocation } from './tools/location/index.mjs';
import { generate as genStyle } from './tools/style/index.mjs';
import { generate as genTheme } from './tools/theme/index.mjs';

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token.startsWith('--')) continue;
    token = token.slice(2);
    let key; let value;
    if (token.includes('=')) {
      [key, value] = token.split('=', 2);
    } else {
      key = token;
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        value = next;
        i++;
      } else {
        value = true;
      }
    }
    opts[key] = value;
  }
  return opts;
}

function parseSpec(value) {
  if (value === undefined || value === true) return undefined;
  if (typeof value === 'number') return value;
  if (/^\d+$/.test(value)) return Number(value);
  if (String(value).includes(',')) return String(value).split(',').map(v => v.trim()).filter(Boolean);
  return value;
}

function findOpt(opts, keys) {
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(opts, k)) return opts[k];
  return undefined;
}

const raw = parseArgs(process.argv.slice(2));

function numericSpec(value) {
  const v = parseSpec(value);
  return (typeof v === 'number') ? v : undefined;
}

const charactersSpec = parseSpec(findOpt(raw, ['characters', 'character', 'chars']));
const locationsSpec = numericSpec(findOpt(raw, ['locations', 'location', 'locs']));
const styleSpec = numericSpec(findOpt(raw, ['style', 's']));
const subjectSpec = numericSpec(findOpt(raw, ['subject', 'sub']));
const themeSpec = numericSpec(findOpt(raw, ['theme', 'themes', 't']));

function generateMany(generator, spec) {
  if (spec === undefined) return [generator()];
  if (typeof spec === 'number') {
    const out = [];
    for (let i = 0; i < spec; i++) out.push(generator());
    return out;
  }
  if (Array.isArray(spec)) return spec.map(s => generator(s));
  return [generator(spec)];
}


const scene = {
  theme: generateMany(genTheme, themeSpec),
  style: generateMany(genStyle, styleSpec),
  subject: generateMany(genSubject, subjectSpec),
  character: generateMany(genCharacter, charactersSpec),
  location: generateMany(genLocation, locationsSpec),
};

console.log(JSON.stringify(scene, null, 2));
