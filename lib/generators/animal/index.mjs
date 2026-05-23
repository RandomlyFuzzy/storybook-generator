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

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const lower = key.charAt(0).toLowerCase() + key.slice(1);
    if (!vars[lower]) return `{${key}}`;
    const val = pick(vars[lower]);
    const upper = key.charAt(0).toUpperCase() + key.slice(1);
    if (upper === key) return capitalise(val);
    return val;
  });
}

export function generate(nameOverride) {
  const prefixes = loadLines('prefixes.txt');
  const types = loadLines('types.txt');
  const names = loadLines('names.txt');
  const appearances = loadLines('appearances.txt');
  const personalities = loadLines('personalities.txt');
  const specials = loadLines('special.txt');
  const templates = loadLines('templates.txt');

  let name = pick(names);
  if (typeof nameOverride === 'string' && nameOverride.trim().length > 0) {
    name = nameOverride.trim();
  }

  const data = {
    prefix: prefixes,
    name: [name],
    type: types,
    appearance: appearances,
    personality: personalities,
    special: specials,
  };

  const rendered = fill(pick(templates), data);
  return rendered;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(generate(process.argv[2]));
}
