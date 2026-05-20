import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadLines(file) {
  return readFileSync(join(__dirname, file), 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const prepositions = ['before them', 'ahead', 'at the edge of town', 'around the next bend', 'beyond the treeline', 'at the end of the road', 'nestled in the valley', 'perched on the hillside', 'huddled against the cliffs', 'sprawled across the flats', 'rising from the mist', 'cut into the rock', 'hidden among the trees'];

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const upper = key.charAt(0).toUpperCase() + key.slice(1);
    const lower = key.charAt(0).toLowerCase() + key.slice(1);
    if (lower === 'adj') return pick(vars.adjectives);
    if (lower === 'type') return pick(vars.types);
    if (lower === 'prep1') return pick(prepositions);
    if (!vars[lower]) return `{${key}}`;
    const val = pick(vars[lower]);
    if (upper === key) return capitalise(val);
    return val;
  });
}

export function generate() {
  const data = {
    sight: loadLines('sight.txt'),
    sound: loadLines('sound.txt'),
    smell: loadLines('smell.txt'),
    atmosphere: loadLines('atmospheres.txt'),
    feature: loadLines('features.txt'),
    adjectives: loadLines('adjectives.txt'),
    types: loadLines('types.txt'),
  };

  const templates = loadLines('templates.txt');

  return fill(pick(templates), data);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(generate());
}
