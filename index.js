import { generate as genSubject } from './tools/subject/index.mjs';
import { generate as genCharacter } from './tools/character/index.mjs';
import { generate as genLocation } from './tools/location/index.mjs';

const scene = {
  subject: genSubject(),
  character: genCharacter(),
  location: genLocation(),
};

console.log(JSON.stringify(scene, null, 2));
