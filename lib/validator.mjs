import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function validateStory(obj) {
  let schema = null;
  try {
    const schemaRaw = fs.readFileSync(join(__dirname, '../schemas/story.schema.json'), 'utf8');
    schema = JSON.parse(schemaRaw);
  } catch (_) { return []; }
  const errors = [];
  function check(obj, schema, path) {
    if (schema.required) {
      for (const key of schema.required) {
        if (obj[key] === undefined || obj[key] === null) {
          errors.push(`${path}.${key} is required`);
        }
      }
      if (schema.properties) {
        for (const key of Object.keys(schema.properties)) {
          if (obj[key] !== undefined) {
            check(obj[key], schema.properties[key], `${path}.${key}`);
          }
        }
      }
    }
    if (schema.type === 'array' && Array.isArray(obj)) {
      if (schema.minItems && obj.length < schema.minItems) {
        errors.push(`${path} has fewer than ${schema.minItems} items`);
      }
      if (schema.items) {
        for (let i = 0; i < obj.length; i++) {
          check(obj[i], schema.items, `${path}[${i}]`);
        }
      }
    }
    if (schema.type === 'string') {
      if (typeof obj !== 'string') {
        errors.push(`${path} should be a string`);
      } else if (schema.minLength !== undefined && obj.length < schema.minLength) {
        errors.push(`${path} should have at least ${schema.minLength} characters`);
      }
    }
    if (schema.type === 'integer' && !Number.isInteger(obj)) {
      errors.push(`${path} should be an integer`);
    }
    if (Array.isArray(schema.type) && !schema.type.includes(typeof obj) && !(schema.type.includes('null') && obj === null)) {
      errors.push(`${path} should be one of: ${schema.type.join(', ')}`);
    }
    if (schema.anyOf) {
      const snapshot = errors.length;
      let anyOfPass = false;
      const attempts = [];
      for (const sub of schema.anyOf) {
        const before = errors.length;
        check(obj, sub, path);
        if (errors.length === before) { anyOfPass = true; break; }
        const subErrors = errors.splice(before);
        attempts.push(subErrors);
      }
      if (!anyOfPass) {
        errors.splice(snapshot);
        const details = schema.anyOf.map((sub, i) => {
          const label = sub.required ? sub.required.join(', ') : JSON.stringify(sub);
          return `  ${i + 1}. ${label} — ${(attempts[i] || []).join('; ') || 'did not match'}`;
        }).join('\n');
        errors.push(`${path} must satisfy at least one of the anyOf constraints. Options:\n${details}`);
      }
    }
  }
  check(obj, schema, '$');
  return compressErrors(errors);
}

function compressErrors(errors) {
  const map = new Map();
  for (const err of errors) {
    const key = err.replace(/\[\d+\]/g, '[*]');
    if (!map.has(key)) map.set(key, []);
    const indices = [...err.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1]));
    map.get(key).push(indices);
  }

  return [...map.entries()].map(([normalized, all]) => {
    if (all.length <= 1) return normalized;
    const depth = (normalized.match(/\[\*\]/g) || []).length;
    const ranges = [];
    for (let d = 0; d < depth; d++) {
      const nums = [...new Set(all.map(a => a[d]))].sort((a, b) => a - b);
      const parts = [];
      let start = nums[0], end = nums[0];
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] === end + 1) { end = nums[i]; }
        else { parts.push(start === end ? `${start}` : `${start}-${end}`); start = end = nums[i]; }
      }
      parts.push(start === end ? `${start}` : `${start}-${end}`);
      ranges.push(parts.join(','));
    }
    let idx = 0;
    return normalized.replace(/\[\*\]/g, () => `[${ranges[idx++] ?? '*'}]`);
  });
}
