#!/usr/bin/env node
import { generate as genSubject } from '../subject/index.mjs';
import { generate as genCharacter } from '../character/index.mjs';
import { generate as genLocation } from '../location/index.mjs';
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

const charNames = parseArg('characters') || parseArg('names') || parseArg('chars');
const charCount = parseArg('count') || parseArg('c');
const locCount = parseArg('locations') || parseArg('locs');
const styleCount = parseArg('style');
const subjectCount = parseArg('subject');

let characters = [];
if (charNames) {
  const names = String(charNames).split(',').map(s => s.trim()).filter(Boolean);
  characters = names.map(n => genCharacter(n));
} else {
  const n = charCount ? Number(charCount) : 1;
  for (let i = 0; i < Math.max(1, n); i++) characters.push(genCharacter());
}

const locations = [];
const locN = locCount ? Number(locCount) : 1;
for (let i = 0; i < Math.max(1, locN); i++) locations.push(genLocation());

const styles = [];
const styN = styleCount ? Number(styleCount) : 1;
for (let i = 0; i < Math.max(1, styN); i++) styles.push(genStyle());

const subjects = [];
const subN = subjectCount ? Number(subjectCount) : 1;
for (let i = 0; i < Math.max(1, subN); i++) subjects.push(genSubject());

const scene = {
  style: styles,
  subject: subjects,
  character: characters,
  location: locations,
};

console.log(JSON.stringify(scene, null, 2));
