// Generate a minimal, structured character appearance seed for LLMs
export function generateAppearanceSeed() {
  const races = [
    'Asian', 'Black', 'White', 'Latino', 'Native American',
    'Middle Eastern', 'South Asian', 'Mixed race'
  ];
  const hairColors = [
    'black', 'brown', 'blonde', 'red', 'gray', 'white', 'blue', 'pink', 'purple'
  ];
  const hairLengths = [
    'short', 'shoulder-length', 'long', 'very short', 'curly', 'straight', 'wavy'
  ];
  const eyeColors = [
    'brown', 'blue', 'green', 'gray', 'hazel', 'amber', 'violet'
  ];
  const faceFeatures = [
    'freckles', 'dimples', 'rosy cheeks', 'button nose', 'flushed cheeks', 'cinnamon-dusted nose'
  ];
  const smiles = [
    'gentle', 'wide', 'missing tooth', 'crinkled', 'contagious', 'impossible to stay mad at'
  ];
  const eyeExpressions = [
    'sparkled with curiosity', 'wide as saucers', 'danced with laughter', 'full of wonder', 'noticed things others missed'
  ];
  const demeanors = [
    'kind', 'adventurous', 'curious', 'brave', 'welcoming', 'imaginative', 'helpful', 'optimistic', 'determined'
  ];
  const clothings = [
    'yellow raincoat', 'patched jacket', 'favorite sweater', 'boots', 'scarf', 'overalls', 'hat', 'glasses', 'backpack', 'dress with pockets', 'bandana', 'cardigan', 'gumboots', 'bow tie', 'mittens', 'jersey', 'skirt', 'trousers', 'shirt', 'belt', 'vest', 'ribbon', 'watch', 'necklace', 'bracelet'
  ];
  const definingFeatures = [
    'laugh like wind chimes', 'heart on sleeve', 'always planning something', 'giggle that made everyone giggle', 'smile that lights up the room', 'contagious delight', 'soft round cheeks', 'curls that bounce', 'face full of expression', 'determined chin', 'brows furrowed in concentration'
  ];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  return {
    race: pick(races),
    hair: {
      color: pick(hairColors),
      length: pick(hairLengths)
    },
    eyes: {
      color: pick(eyeColors),
      expression: pick(eyeExpressions)
    },
    face: {
      feature: pick(faceFeatures),
      smile: pick(smiles)
    },
    demeanor: pick(demeanors),
    clothing: pick(clothings),
    defining_feature: pick(definingFeatures)
  };
}
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

export function generate(fullnameOverride) {
  const prefixes = loadLines('prefixes.txt');
  const namesMale = loadLines('names_male.txt');
  const namesFemale = loadLines('names_female.txt');
  const surnames = loadLines('surnames.txt');
  const appearances = loadLines('appearances.txt');
  const demeanors = loadLines('demeanors.txt');
  const clothing = loadLines('clothing.txt');
  const histories = loadLines('histories.txt');
  const templates = loadLines('templates.txt');
  const physical = loadLines('physical.txt');

  const first = Math.random() > 0.5 ? pick(namesMale) : pick(namesFemale);
  const last = pick(surnames);
  let fullname = `${first} ${last}`;
  if (typeof fullnameOverride === 'string' && fullnameOverride.trim().length > 0) {
    fullname = fullnameOverride.trim();
  }

  // Parse physical.txt into categories
  const races = physical.filter(l => !l.startsWith('#') && ['Asian','Black','White','Latino','Native American','Middle Eastern','South Asian','Mixed race'].includes(l));
  const hairColors = physical.filter(l => l.endsWith('hair') && !l.includes('length'));
  const hairLengths = physical.filter(l => l.endsWith('hair') && (l.includes('length') || l.startsWith('short') || l.startsWith('long') || l.startsWith('very') || l.startsWith('curly') || l.startsWith('straight') || l.startsWith('wavy')));
  const eyeColors = physical.filter(l => l.endsWith('eyes'));

  const data = {
    prefix: prefixes,
    fullname,
    appearance: appearances,
    demeanor: demeanors,
    clothing,
    history: histories,
    race: races,
    haircolor: hairColors,
    hairlength: hairLengths,
    eyecolor: eyeColors,
  };

  // Use all data fields for a compact, structured description
  // Use the same structure as generateAppearanceSeed
  // Fallbacks in case physical.txt is missing some categories
  function safePick(arr, fallback) {
    return Array.isArray(arr) && arr.length > 0 ? pick(arr) : fallback;
  }
  // Use static lists for extra features (from generateAppearanceSeed)
  const faceFeatures = [
    'freckles', 'dimples', 'rosy cheeks', 'button nose', 'flushed cheeks', 'cinnamon-dusted nose'
  ];
  const smiles = [
    'gentle', 'wide', 'missing tooth', 'crinkled', 'contagious', 'impossible to stay mad at'
  ];
  const eyeExpressions = [
    'sparkled with curiosity', 'wide as saucers', 'danced with laughter', 'full of wonder', 'noticed things others missed'
  ];
  const definingFeatures = [
    'laugh like wind chimes', 'heart on sleeve', 'always planning something', 'giggle that made everyone giggle', 'smile that lights up the room', 'contagious delight', 'soft round cheeks', 'curls that bounce', 'face full of expression', 'determined chin', 'brows furrowed in concentration'
  ];

  const appearance = {
    race: safePick(races, 'Unknown'),
    hair: {
      color: safePick(hairColors, 'Unknown'),
      length: safePick(hairLengths, 'Unknown')
    },
    eyes: {
      color: safePick(eyeColors, 'Unknown'),
      expression: pick(eyeExpressions)
    },
    face: {
      feature: pick(faceFeatures),
      smile: pick(smiles)
    },
    demeanor: safePick(demeanors, ''),
    clothing: safePick(clothing, ''),
    defining_feature: pick(definingFeatures)
  };

  // Compose a compact, readable description using all fields
  const description = `A ${appearance.race} child with ${appearance.hair.color} ${appearance.hair.length} hair, ${appearance.face.feature} and a ${appearance.face.smile} smile, ${appearance.eyes.color} eyes that ${appearance.eyes.expression}, usually seen in ${appearance.clothing}. Known for their ${appearance.demeanor} nature and ${appearance.defining_feature}.`;

  return {
    name: fullname,
    description
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(generate(process.argv[2]), null, 2));
}
