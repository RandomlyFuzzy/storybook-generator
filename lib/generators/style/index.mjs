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

export function generate(override) {
  if (typeof override === 'string' && override.trim().length > 0) {
    return capitalise(override.trim());
  }

  const data = {
    name: loadLines('names.txt'),
    media: loadLines('media.txt'),
    palette: loadLines('palettes.txt'),
    texture: loadLines('textures.txt'),
    detail: loadLines('details.txt'),
    mood: loadLines('moods.txt'),
  };

  const templates = loadLines('templates.txt');

  return fill(pick(templates), data);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(generate(process.argv[2]));
}
