#!/usr/bin/env node
import { generate as genStyle } from '../style/index.mjs';

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

const countArg = parseArg('count', 'c');
const count = countArg ? Number(countArg) : 1;
const out = [];
for (let i = 0; i < Math.max(1, count); i++) out.push(genStyle());
console.log(JSON.stringify(out, null, 2));
