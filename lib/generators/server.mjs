import http from 'http';
import { generate as genSubject } from './subject/index.mjs';
import { generate as genCharacter } from './character/index.mjs';
import { generate as genAnimal } from './animal/index.mjs';
import { generate as genThing } from './thing/index.mjs';
import { generate as genLocation } from './location/index.mjs';
import { generate as genStyle } from './style/index.mjs';

const PORT = process.env.PORT || 3000;

function parseNamesParam(val) {
  if (!val) return null;
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

function parseCountParam(val) {
  const n = Number(val);
  return (Number.isInteger(n) && n > 0) ? n : 1;
}

function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    const qp = url.searchParams;

    if (p === '/' || p === '/help') {
      return json(res, {
        ok: true,
        routes: {
          scene: '/scene?characters=Alice,Bob&locations=2&style=1&subject=1',
          character: '/character?names=Alice,Bob or &count=3',
          animal: '/animal?names=Floof,Button or &count=3',
          thing: '/thing?names=Starglow,Moondrop or &count=3',
          subject: '/subject?count=1',
          style: '/style?count=1',
          location: '/location?count=1',
        },
      });
    }

    if (p === '/character') {
      const names = parseNamesParam(qp.get('names'));
      if (names) return json(res, names.map(n => genCharacter(n)));
      const count = parseCountParam(qp.get('count'));
      const out = [];
      for (let i = 0; i < count; i++) out.push(genCharacter());
      return json(res, out);
    }

    if (p === '/animal') {
      const names = parseNamesParam(qp.get('names'));
      if (names) return json(res, names.map(n => genAnimal(n)));
      const count = parseCountParam(qp.get('count'));
      const out = [];
      for (let i = 0; i < count; i++) out.push(genAnimal());
      return json(res, out);
    }

    if (p === '/thing') {
      const names = parseNamesParam(qp.get('names'));
      if (names) return json(res, names.map(n => genThing(n)));
      const count = parseCountParam(qp.get('count'));
      const out = [];
      for (let i = 0; i < count; i++) out.push(genThing());
      return json(res, out);
    }

    if (p === '/subject') {
      const count = parseCountParam(qp.get('count'));
      const out = [];
      for (let i = 0; i < count; i++) out.push(genSubject());
      return json(res, out);
    }

    if (p === '/style') {
      const count = parseCountParam(qp.get('count'));
      const out = [];
      for (let i = 0; i < count; i++) out.push(genStyle());
      return json(res, out);
    }

    if (p === '/location') {
      const count = parseCountParam(qp.get('count'));
      const out = [];
      for (let i = 0; i < count; i++) out.push(genLocation());
      return json(res, out);
    }

    if (p === '/scene') {
      const charNames = parseNamesParam(qp.get('characters')) || parseNamesParam(qp.get('names'));
      const charCount = parseCountParam(qp.get('characters')) || parseCountParam(qp.get('count')) || 1;
      const animalCount = parseCountParam(qp.get('animals'));
      const thingCount = parseCountParam(qp.get('things'));
      const locCount = parseCountParam(qp.get('locations')) || 1;
      const styleCount = parseCountParam(qp.get('style')) || 1;
      const subjectCount = parseCountParam(qp.get('subject')) || 1;

      const characters = [];
      if (charNames) {
        for (const n of charNames) characters.push(genCharacter(n));
      } else {
        for (let i = 0; i < Math.max(1, charCount); i++) characters.push(genCharacter());
      }

      const animals = [];
      for (let i = 0; i < Math.max(0, animalCount); i++) animals.push(genAnimal());

      const things = [];
      for (let i = 0; i < Math.max(0, thingCount); i++) things.push(genThing());

      const locations = [];
      for (let i = 0; i < Math.max(1, locCount); i++) locations.push(genLocation());

      const styles = [];
      for (let i = 0; i < Math.max(1, styleCount); i++) styles.push(genStyle());

      const subjects = [];
      for (let i = 0; i < Math.max(1, subjectCount); i++) subjects.push(genSubject());

      return json(res, { style: styles, subject: subjects, character: characters, animal: animals, thing: things, location: locations });
    }

    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    json(res, { error: String(err) }, 500);
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Story tools server listening on http://localhost:${PORT}`);
});
