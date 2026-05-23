import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { validateStory } from './validator.mjs';

export class StoryPageCompiler {
  constructor(options = {}) {
    this._validateEnabled = options.schemaPath !== false;
  }

  compile(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    const story = JSON.parse(raw);
    if (this._validateEnabled) {
      const errors = validateStory(story);
      if (errors.length > 0) {
        throw new Error(`Validation failed:\n  ${errors.join('\n  ')}`);
      }
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

  _normalize(story) {
    const styleAddOn = story.styleAddOn || '';
    const theme = story.theme || '';
    const targetAge = story.target_age || [];
    const allCharacters = story.characters || [];
    const allAnimals = story.animals || [];
    const allThings = story.things || [];
    const ageStr = targetAge.length === 2 ? `ages ${targetAge[0]}-${targetAge[1]}` : '';

    const pages = [];

    if (story.front_cover) {
      pages.push(this._buildPage({
        title: story.front_cover.title,
        characters: allCharacters,
        animals: allAnimals,
        things: allThings,
        imagePrompt: story.front_cover.image_Prompt || '',
        subtitle: story.front_cover.subtitle ?? null,
      }, styleAddOn, theme, ageStr));
    }

    if (story.pages) {
      for (const p of story.pages) {
        // Merge top-level and page-level entities by name, combining description (top-level) and in_scene (page)
        const mergeEntities = (pageList, topList) => {
          const pageMap = new Map((pageList || []).map(e => [e.name, e]));
          const result = [];
          // Add/merge all from topList
          for (const top of topList) {
            const page = pageMap.get(top.name);
            if (page) {
              result.push({
                name: top.name,
                description: top.description || '',
                in_scene: page.in_scene || ''
              });
              pageMap.delete(top.name);
            } else {
              result.push({
                name: top.name,
                description: top.description || '',
                in_scene: ''
              });
            }
          }
          // Add any page-only entities not in topList
          for (const [name, page] of pageMap.entries()) {
            result.push({
              name: page.name,
              description: '',
              in_scene: page.in_scene || ''
            });
          }
          return result;
        };
        pages.push(this._buildPage({
          title: null,
          page: p.page ?? null,
          characters: mergeEntities(p.characters, allCharacters),
          animals: mergeEntities(p.animals, allAnimals),
          things: mergeEntities(p.things, allThings),
          imagePrompt: p.image_Prompt || '',
          subtitle: p.subtitle ?? null,
        }, styleAddOn, theme, ageStr));
      }
    }

    if (story.back_cover) {
      pages.push(this._buildPage({
        title: null,
        characters: [],
        animals: [],
        things: [],
        imagePrompt: story.back_cover.image_prompt || '',
        subtitle: null,
      }, styleAddOn, theme, ageStr));
    }

    return pages;
  }

  _buildPage(data, styleAddOn, theme, ageStr) {
    const mapEntity = e => {
      const parts = [e.name];
      if (e.description) parts.push(e.description);
      if (e.in_scene) parts.push(e.in_scene);
      return parts.join(' — ');
    };
    const parts = [
      ...data.characters.map(mapEntity),
      ...data.animals.map(mapEntity),
      ...data.things.map(mapEntity),
    ];
    const charStr = parts.join('. ');

    const promptParts = [
      "The image should not look realistic in any way. Strictly adhere to the specified art style:",
      styleAddOn,
      charStr,
      theme,
      ageStr,
      data.imagePrompt
    ].filter(Boolean);
    const imagePrompt = promptParts.join('. ');

    const page = {
      image_prompt: imagePrompt,
      subtitles: data.subtitle,
    };

    if (data.title) {
      page.title = data.title;
    }
    if (data.page != null) {
      page.page = data.page;
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
