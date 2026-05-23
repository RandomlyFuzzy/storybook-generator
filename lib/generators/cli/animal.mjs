#!/usr/bin/env node
import { generate } from '../animal/index.mjs';

function parseArg(name, alias) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith(`--${name}=`)) return a.split('=')[1];
    if (alias && a.startsWith(`-${alias}=`)) return a.split('=')[1];
    if (a === `--${name}` || (alias && a === `-${alias}`)) return argv[i + 1];
  }
  return undefined;
}

const names = parseArg('names');
const count = parseArg('count') || parseArg('c');

const out = [];
if (names) {
  const split = String(names).split(',').map(s => s.trim()).filter(Boolean);
  out.push(...split.map(n => generate(n)));
} else {
  const n = count ? Number(count) : 1;
  for (let i = 0; i < Math.max(1, n); i++) out.push(generate());
}
console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
