import fs from 'fs';
import path from 'path';

const THEMES_PATH = path.resolve(path.dirname(import.meta.url.replace('file://', '')), 'themes.txt');

function getThemes() {
  const data = fs.readFileSync(THEMES_PATH, 'utf8');
  return data.split('\n').map(t => t.trim()).filter(Boolean);
}

export function generate(spec) {
  const themes = getThemes();
  if (!spec) {
    return themes[Math.floor(Math.random() * themes.length)];
  }
  if (typeof spec === 'number') {
    return themes[spec % themes.length];
  }
  if (Array.isArray(spec)) {
    return spec.map(s => generate(s));
  }
  // Try to match a theme by substring
  const found = themes.find(t => t.toLowerCase().includes(String(spec).toLowerCase()));
  return found || themes[0];
}
