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
    if (lower === 'fullname') return vars.fullname;
    if (!vars[lower]) return `{${key}}`;
    const val = pick(vars[lower]);
    const upper = key.charAt(0).toUpperCase() + key.slice(1);
    if (upper === key) return capitalise(val);
    return val;
  });
}

export function generate() {
  const prefixes = loadLines('prefixes.txt');
  const namesMale = loadLines('names_male.txt');
  const namesFemale = loadLines('names_female.txt');
  const surnames = loadLines('surnames.txt');
  const appearances = loadLines('appearances.txt');
  const demeanors = loadLines('demeanors.txt');
  const clothing = loadLines('clothing.txt');
  const histories = loadLines('histories.txt');
  const templates = loadLines('templates.txt');

  const first = Math.random() > 0.5 ? pick(namesMale) : pick(namesFemale);
  const last = pick(surnames);
  const fullname = `${first} ${last}`;

  const data = {
    prefix: prefixes,
    fullname,
    appearance: appearances,
    demeanor: demeanors,
    clothing,
    history: histories,
  };

  return fill(pick(templates), data);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(generate());
}
