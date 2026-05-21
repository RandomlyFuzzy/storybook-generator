# BookIdeas_Pipeline

This repository contains simple procedural generators and a `story.js` orchestrator that uses a local Ollama model (HTTP or CLI) to generate children's picture-book stories and image prompts.

Quick usage

- Generate a scene (CLI):

  node tools/cli/scene.mjs --characters="Alice,Bob" --locations=2 --style=1 --subject=1

- Generate a story JSON (uses Ollama HTTP streaming if available, otherwise `ollama` CLI):

  node story.js --pages 8 --out story_output.json --model gemma4:e2b --verbose

Options

- `--pages`, `-p`: number of pages to request (default 8)
- `--out`, `-o`: output filename (default `story_output.json`)
- `--model`: Ollama model name for `story.js` (default `gemma4:e2b`)
- `--verbose`, `-v`: show detailed logs and model output preview
- `--dump-prompt`: write the full prompt to `story_prompt.txt`

Simplified JSON schema (written by `story.js`)

The generated and simplified JSON written by `story.js` follows this shape:

{
  "style_addon": "string",
  "characters": [
    { "name": string|null, "description": string }
  ],
  "frontpage": {
    "title": "string",
    "subtitle": "string?",
    "image_prompt": "concise prompt string",
    "image_prompt_detailed": "detailed prompt string",
    "included_characters": [ { "name": string|null, "description": string } ]
  },
  "middlepages": [
    {
      "page_num": number,
      "subtitles": "string",
      "image_prompt": "concise prompt",
      "image_prompt_detailed": "detailed prompt",
      "included_characters": [ { "name": string|null, "description": string } ]
    }
  ],
  "back_cover": {
    "image_prompt": "concise prompt",
    "image_prompt_detailed": "detailed prompt",
    "included_characters": [ { "name": string|null, "description": string } ],
    "negative_prompt": "string (things to avoid)"
  }
}

Notes & Implementation details

- Character detection: `included_characters` is computed heuristically by searching page/front/back text and prompts for character name variants (first name, last name, full name). It may miss or falsely include characters for ambiguous text.
- `style_addon` is preserved once at top-level and not duplicated.
- `image_prompt` is a concise one-line prompt and `image_prompt_detailed` is the high-detail prompt suitable for HQ generation.
- `negative_prompt` defaults to `"barcodes, text, watermarks, logos, QR codes"` if not provided by the model.

Extending and debugging

- To adjust how character detection works, edit `buildCharInfos()` and `charVisibleOnText()` inside `story.js`.
- To change how prompts are assembled (e.g., include/exclude `style_addon`), modify the prompt-building logic in `buildPrompt()`.

Running without Ollama

If you do not have Ollama available, `story.js` will fall back to writing the final prompt to `story_prompt.txt` for manual use.

License

This project is experimental utility code; copy, adapt and use as you like.
