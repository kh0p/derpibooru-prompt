# Derpibooru Prompt — Obsidian Plugin

Syntax highlighting and tag autocomplete for image generation prompts inside Obsidian, powered by the Derpibooru tag database (~97 000 tags).

---

## Installation

1. Unzip the release archive — you get a folder named `derpibooru-prompt`
2. Copy it into your vault's plugin directory: `.obsidian/plugins/derpibooru-prompt/`
3. In Obsidian open **Settings → Community plugins**, find **Derpibooru Prompt** and toggle it on
4. The plugin loads `tags.json` from the same folder — make sure it is present alongside `main.js` and `manifest.json`

> **Note:** the plugin is marked `isDesktopOnly: true` because it relies on the CodeMirror 5 global that Obsidian exposes in its desktop Electron environment.

---

## Usage

Use the language identifier `prompt` on any fenced code block:

````markdown
```prompt
(twilight sparkle:1.2), solo, simple_background, [[magic]],
<lora:style_model:0.7>, (cute), ![bad anatomy], safe
```
````

That is all — highlighting activates automatically, and autocomplete triggers while you type inside the block.

---

## Features

### Syntax Highlighting

Every token type gets a distinct colour so you can scan a prompt at a glance.

| Syntax | What it means | Colour |
|---|---|---|
| `(tag:1.2)` | Weighted tag | Orange, bold |
| `[[tag]]` | Strong emphasis (double-bracket) | Purple, bold |
| `(tag)` | Plain emphasis | Cyan |
| `<lora:name:0.8>` | LoRA model reference | Green, italic |
| `![tag]` | Negative tag | Red, strikethrough |
| `word_with_underscores` | Underscore-form tag | Dotted yellow underline |
| `1.2` / `0.8` | Bare numbers and weight values | Amber |
| `, [ ] < >` | Punctuation | Muted grey |

Colours follow the One Dark palette and work well with both dark and light Obsidian themes.

#### Underscore tag warning

Derpibooru stores tags with underscores (`simple_background`), but image generation tools like Stable Diffusion expect spaces (`simple background`). Any token matching the `word_word` pattern is given a dotted underline as a visual reminder to double-check which form your target model expects.

---

### Tag Autocomplete

While typing inside a `prompt` block, a popup appears with up to 15 suggestions sourced from the full Derpibooru database.

**Triggering:** autocomplete activates after 2 characters. Both space-separated and underscore-separated input work — typing `rainbow d` and typing `rainbow_d` both surface `rainbow dash` / `rainbow_dash`.

**Suggestion popup columns:**

| Column | Description |
|---|---|
| Tag name | Displayed with spaces (prompt-friendly form) |
| Type badge | Category of the tag, colour-coded by type |
| Count | Number of Derpibooru posts using this tag |

Suggestions are ranked by post count, so the most commonly used tags appear first.

**Keyboard navigation:**

| Key | Action |
|---|---|
| `↓` / `↑` | Move selection up/down |
| `Enter` or `Tab` | Insert selected tag |
| `Escape` | Dismiss popup |

You can also click any row with the mouse. The inserted text always uses spaces, not underscores.

---

### Tag Type Colours

The autocomplete popup uses a colour-coded left border and badge for every Derpibooru tag category:

| Type | Category | Colour |
|---|---|---|
| 1 | content-official | Blue |
| 2 | general | Grey |
| 3 | species | Cyan |
| 4 | OC | Purple |
| 5 | rating | Yellow |
| 6 | body-type | Green |
| 7 | character | Red |
| 8 | origin | Orange |
| 9 | error | Bright red |
| 10 | spoiler | Pink |
| 11 | content-fanmade | Lavender |

