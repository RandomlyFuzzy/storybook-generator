#!/usr/bin/env node
import { generate as genCharacter } from '../character/index.mjs';

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

const namesArg = parseArg('names', 'n');
const countArg = parseArg('count', 'c');

if (namesArg) {
  const names = String(namesArg).split(',').map(s => s.trim()).filter(Boolean);
  const out = names.map(n => genCharacter(n));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const count = countArg ? Number(countArg) : 1;
const out = [];
for (let i = 0; i < Math.max(1, count); i++) out.push(genCharacter());
console.log(JSON.stringify(out, null, 2));
