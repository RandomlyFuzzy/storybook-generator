import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

const DEFAULT_SCHEMA_PATH = 'story.schema.json';

export class StoryPageCompiler {
  constructor(options = {}) {
    this._schema = null;
    if (options.schemaPath !== false) {
      this._loadSchema(options.schemaPath || DEFAULT_SCHEMA_PATH);
    }
  }

  _loadSchema(schemaPath) {
    try {
      const raw = readFileSync(schemaPath, 'utf-8');
      this._schema = JSON.parse(raw);
    } catch {
      console.warn(`Warning: could not load schema at "${schemaPath}" — validation disabled`);
    }
  }

  compile(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    const story = JSON.parse(raw);
    const errors = this._validate(story);
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n  ${errors.join('\n  ')}`);
    }
    return this._normalize(story);
  }

  compileAll(dirPath) {
    const results = [];
    for (const file of this._collectJSONFiles(dirPath)) {
      try {
        results.push(this.compile(file));
      } catch (err) {
        console.error(`Skipping ${file}: ${err.message}`);
      }
    }
    return results;
  }

  compileAllFlat(dirPath) {
    return this.compileAll(dirPath).flat();
  }

  _validate(obj) {
    if (!this._schema) return [];
    const errors = [];
    this._check(obj, this._schema, '$', errors);
    return errors;
  }

  _check(obj, schema, path, errors) {
    if (schema.type === 'object' && schema.required) {
      for (const key of schema.required) {
        if (obj == null || obj[key] === undefined || obj[key] === null) {
          errors.push(`${path}.${key} is required`);
        }
      }
      if (obj != null && schema.properties) {
        for (const key of Object.keys(schema.properties)) {
          if (obj[key] !== undefined) {
            this._check(obj[key], schema.properties[key], `${path}.${key}`, errors);
          }
        }
      }
    }
    if (schema.type === 'array') {
      if (!Array.isArray(obj)) {
        errors.push(`${path} should be an array`);
      } else if (schema.items) {
        for (let i = 0; i < obj.length; i++) {
          this._check(obj[i], schema.items, `${path}[${i}]`, errors);
        }
      }
    }
    if (schema.type === 'string' && typeof obj !== 'string') {
      errors.push(`${path} should be a string`);
    }
    if (schema.type === 'number' && typeof obj !== 'number') {
      errors.push(`${path} should be a number`);
    }
    if (schema.type === 'integer' && !Number.isInteger(obj)) {
      errors.push(`${path} should be an integer`);
    }
  }

  _normalize(story) {
    const styleAddOn = story.styleAddOn || '';
    const theme = story.theme || '';
    const targetAge = story.target_age || [];
    const allCharacters = story.characters || [];
    const ageStr = targetAge.length === 2 ? `ages ${targetAge[0]}-${targetAge[1]}` : '';

    const pages = [];

    if (story.front_cover) {
      pages.push(this._buildPage({
        title: story.front_cover.title,
        characters: allCharacters,
        imagePrompt: story.front_cover.image_Prompt || '',
        subtitle: story.front_cover.subtitle ?? null,
      }, styleAddOn, theme, ageStr));
    }

    if (story.pages) {
      for (const p of story.pages) {
        pages.push(this._buildPage({
          title: null,
          characters: p.characters || [],
          imagePrompt: p.image_Prompt || '',
          subtitle: p.subtitle ?? null,
        }, styleAddOn, theme, ageStr));
      }
    }

    if (story.back_cover) {
      pages.push(this._buildPage({
        title: null,
        characters: [],
        imagePrompt: story.back_cover.image_prompt || '',
        subtitle: null,
      }, styleAddOn, theme, ageStr));
    }

    return pages;
  }

  _buildPage(data, styleAddOn, theme, ageStr) {
    const charStr = data.characters
      .map(c => `${c.name}${c.in_scene ? ` — ${c.in_scene}` : c.description ? ` — ${c.description}` : ''}`)
      .join('. ');

    const parts = [styleAddOn, charStr, theme, ageStr, data.imagePrompt].filter(Boolean);
    const imagePrompt = parts.join('. ');

    const page = {
      image_prompt: imagePrompt,
      subtitles: data.subtitle,
    };

    if (data.title) {
      page.title = data.title;
    }

    return page;
  }

  _collectJSONFiles(dirPath) {
    const results = [];
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...this._collectJSONFiles(fullPath));
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
        results.push(fullPath);
      }
    }
    return results;
  }
}
