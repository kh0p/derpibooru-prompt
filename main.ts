import { Plugin, MarkdownView } from "obsidian";
import type { EditorView } from "@codemirror/view";

// ── Tag type metadata ──────────────────────────────────────────────────────
const TAG_TYPE_LABELS: Record<number, string> = {
  1: "content-official",
  2: "general",
  3: "species",
  4: "oc",
  5: "rating",
  6: "body-type",
  7: "character",
  8: "origin",
  9: "error",
  10: "spoiler",
  11: "content-fanmade",
};

const TAG_TYPE_CLASS: Record<number, string> = {
  1: "official",
  2: "general",
  3: "species",
  4: "oc",
  5: "rating",
  6: "body-type",
  7: "character",
  8: "origin",
  9: "error",
  10: "spoiler",
  11: "fanmade",
};

type TagEntry = [string, number, number];

// ── Trie ───────────────────────────────────────────────────────────────────
interface TrieNode {
  children: Map<string, TrieNode>;
  entries: TagEntry[];
}
function mkNode(): TrieNode { return { children: new Map(), entries: [] }; }

class TagTrie {
  root: TrieNode = mkNode();

  insert(entry: TagEntry) {
    const forms = new Set([entry[0], entry[0].replace(/_/g, " ")]);
    for (const form of forms) {
      let node = this.root;
      for (const ch of form.toLowerCase()) {
        if (!node.children.has(ch)) node.children.set(ch, mkNode());
        node = node.children.get(ch)!;
      }
      if (!node.entries.find(e => e[0] === entry[0])) node.entries.push(entry);
    }
  }

  search(prefix: string, limit = 20): TagEntry[] {
    let node = this.root;
    for (const ch of prefix.toLowerCase()) {
      if (!node.children.has(ch)) return [];
      node = node.children.get(ch)!;
    }
    const results: TagEntry[] = [];
    const queue: TrieNode[] = [node];
    while (queue.length && results.length < limit * 3) {
      const cur = queue.shift()!;
      results.push(...cur.entries);
      for (const child of cur.children.values()) queue.push(child);
    }
    const seen = new Set<string>();
    return results
      .filter(e => { if (seen.has(e[0])) return false; seen.add(e[0]); return true; })
      .sort((a, b) => b[2] - a[2])
      .slice(0, limit);
  }
}

// ── Autocomplete popup ─────────────────────────────────────────────────────
interface Suggestion { display: string; insert: string; raw: string; type: number; count: number; }

class AutocompletePopup {
  el: HTMLElement;
  suggestions: Suggestion[] = [];
  selectedIndex = 0;
  onSelect: (s: Suggestion) => void;

  constructor(onSelect: (s: Suggestion) => void) {
    this.onSelect = onSelect;
    this.el = document.createElement("div");
    this.el.className = "derpi-autocomplete-popup derpi-popup-hidden";
    document.body.appendChild(this.el);
  }

  show(suggestions: Suggestion[], coords: { top: number; left: number }) {
    this.suggestions = suggestions;
    this.selectedIndex = 0;
    this.render(coords);
    this.el.classList.remove("derpi-popup-hidden");
  }

  hide() { this.el.classList.add("derpi-popup-hidden"); this.suggestions = []; }
  isVisible() { return !this.el.classList.contains("derpi-popup-hidden"); }
  moveDown() { this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length; this.render({}); }
  moveUp() { this.selectedIndex = (this.selectedIndex - 1 + this.suggestions.length) % this.suggestions.length; this.render({}); }
  confirmSelection(): Suggestion | null { return this.suggestions[this.selectedIndex] ?? null; }

  private render(coords?: { top?: number; left?: number }) {
    this.el.empty();
    this.suggestions.forEach((s, i) => {
      const row = this.el.createDiv({ cls: `derpi-ac-row derpi-type-${TAG_TYPE_CLASS[s.type] ?? "general"}` });
      if (i === this.selectedIndex) row.addClass("derpi-ac-selected");
      row.createSpan({ cls: "derpi-ac-name", text: s.display });
      row.createSpan({ cls: "derpi-ac-type", text: TAG_TYPE_LABELS[s.type] ?? `type-${s.type}` });
      row.createSpan({ cls: "derpi-ac-count", text: s.count > 0 ? s.count.toLocaleString() : "" });
      row.addEventListener("mousedown", e => { e.preventDefault(); this.selectedIndex = i; this.onSelect(s); });
    });
    if (coords?.top || coords?.left) {
      const left = coords.left ?? 0;
      const top = coords.top ?? 0;
      this.el.style.left = `${Math.min(left, window.innerWidth - 310)}px`;
      this.el.style.top = `${top + 4}px`;
    }
  }

  destroy() { this.el.remove(); }
}

// ── CM5 simple mode definition ─────────────────────────────────────────────
//
// CodeMirror 5's defineSimpleMode is what Obsidian uses for code block
// syntax highlighting. Rules are tested top-to-bottom; first match wins.
// The "token" string becomes the CSS class: cm-<token>.
//
// Rule order matters for overlapping patterns:
//   1. LoRA tags      <lora:name:weight>         → cm-derpi-lora
//   2. Weighted tags  (tag:1.2)                  → cm-derpi-weight
//   3. Strong emph    [[tag]]                    → cm-derpi-strong
//   4. Emphasis       (tag)  without weight      → cm-derpi-emphasis
//   5. Negative       ![tag]                     → cm-derpi-negative
//   6. Underscore tag word_word                  → cm-derpi-underscore
//   7. Numbers / weights standalone              → cm-derpi-number
//   8. Punctuation    , ( ) [ ] < >              → cm-derpi-punct

function definePromptMode() {
  // @ts-ignore – CodeMirror 5 global injected by Obsidian
  if (typeof CodeMirror === "undefined" || !CodeMirror.defineSimpleMode) return false;

  const mode = {
    start: [
      // LoRA: <lora:anything>
      { regex: /<lora:[^>\n]+>/i,                                  token: "derpi-lora" },

      // Weighted tag: (some tag:1.2) — parens, content, colon, number
      { regex: /\([^()\n]*:\s*\d+(?:\.\d+)?\s*\)/,                token: "derpi-weight" },

      // Strong emphasis: [[tag]]
      { regex: /\[\[[^\]\n]*\]\]/,                                  token: "derpi-strong" },

      // Plain emphasis: (tag) — parens but no weight pattern inside
      { regex: /\([^()\n]*\)/,                                      token: "derpi-emphasis" },

      // Negative: ![tag]
      { regex: /!\[[^\]\n]*\]/,                                     token: "derpi-negative" },

      // Underscore tag: word_word (two or more segments)
      { regex: /\b\w+(?:_\w+)+\b/,                                  token: "derpi-underscore" },

      // Numbers / weight values standing alone
      { regex: /\b\d+(?:\.\d+)?\b/,                                 token: "derpi-number" },

      // Punctuation: commas, angle brackets, bare brackets
      { regex: /[,<>\[\]]/,                                          token: "derpi-punct" },
    ],
  };

  // @ts-ignore
  CodeMirror.defineSimpleMode("prompt", mode);
  // @ts-ignore
  CodeMirror.defineSimpleMode("Prompt", mode);
  return true;
}

// ── Main Plugin ────────────────────────────────────────────────────────────
export default class DerpibooruPromptPlugin extends Plugin {
  trie: TagTrie = new TagTrie();
  popup: AutocompletePopup | null = null;
  private modeSetupInterval: number | null = null;

  async onload() {
    console.log("DerpibooruPrompt: loading");
    await this.loadTags();

    this.popup = new AutocompletePopup(s => this.insertSuggestion(s));

    // Keep trying until CodeMirror is available (mirrors GDScript plugin approach)
    this.modeSetupInterval = window.setInterval(() => {
      if (definePromptMode()) {
        console.log("DerpibooruPrompt: CM5 mode registered");
        if (this.modeSetupInterval !== null) {
          window.clearInterval(this.modeSetupInterval);
          this.modeSetupInterval = null;
        }
        // Rebuild all open leaves so existing code blocks pick up the mode
        this.app.workspace.iterateAllLeaves(leaf => (leaf as any).rebuildView?.());
      }
    }, 100);

    // Autocomplete
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, view) => {
        if (view instanceof MarkdownView) this.handleEditorChange(editor, view);
      })
    );

    const doc = document; // resolve once, use activeDocument references below
    this.registerDomEvent(doc, "keydown", (e: KeyboardEvent) => {
      if (!this.popup?.isVisible()) return;
      if (e.key === "ArrowDown")                    { e.preventDefault(); this.popup.moveDown(); }
      else if (e.key === "ArrowUp")                 { e.preventDefault(); this.popup.moveUp(); }
      else if (e.key === "Enter" || e.key === "Tab") {
        const s = this.popup.confirmSelection();
        if (s) { e.preventDefault(); this.insertSuggestion(s); }
      } else if (e.key === "Escape") { this.popup.hide(); }
    });

    this.registerDomEvent(doc, "mousedown", (e: MouseEvent) => {
      if (!this.popup?.el.contains(e.target as Node)) this.popup?.hide();
    });

    this.injectStyles();
    console.log("DerpibooruPrompt: ready");
  }

  async loadTags() {
    try {
      const raw = await this.app.vault.adapter.read(`${this.manifest.dir}/tags.json`);
      const entries: TagEntry[] = JSON.parse(raw);
      for (const e of entries) this.trie.insert(e);
    } catch (e) {
      console.error("DerpibooruPrompt: failed to load tags.json", e);
    }
  }

  handleEditorChange(editor: import("obsidian").Editor, view: import("obsidian").MarkdownView) {
    const cursor = editor.getCursor();

    if (!this.isInsidePromptBlock(editor, cursor)) { this.popup?.hide(); return; }

    const beforeCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const tokenMatch = beforeCursor.match(/([a-zA-Z0-9 _\-'.]+)$/);
    const prefix = tokenMatch ? tokenMatch[1].trimStart() : "";

    if (prefix.length < 2) { this.popup?.hide(); return; }

    const results = this.trie.search(prefix.replace(/ /g, "_"), 15);
    if (!results.length) { this.popup?.hide(); return; }

    const suggestions: Suggestion[] = results.map(([raw, type, count]) => ({
      display: raw.replace(/_/g, " "), insert: raw.replace(/_/g, " "), raw, type, count,
    }));

    // Get cursor pixel coords from the CM6 view (used for editing) for popup
    const cmView = (view as any).editor?.cm;
    let coords = { top: 200, left: 200 };
    if (cmView) {
      const pos = cmView.state.selection.main.head;
      const c = cmView.coordsAtPos(pos);
      if (c) coords = { top: c.bottom, left: c.left };
    }
    this.popup?.show(suggestions, coords);
  }

  isInsidePromptBlock(editor: import("obsidian").Editor, cursor: import("obsidian").EditorPosition): boolean {
    let inBlock = false;
    for (let i = 0; i <= cursor.line; i++) {
      const line = editor.getLine(i).trim();
      if (/^(`{3,}|~{3,})\s*[Pp]rompt\s*$/.test(line)) inBlock = true;
      else if (inBlock && /^(`{3,}|~{3,})$/.test(line) && i < cursor.line) inBlock = false;
    }
    return inBlock;
  }

  insertSuggestion(suggestion: Suggestion) {
    const editor = this.app.workspace.activeEditor?.editor;
    if (!editor) return;
    const cursor = editor.getCursor();
    const beforeCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const tokenMatch = beforeCursor.match(/([a-zA-Z0-9 _\-'.]+)$/);
    if (!tokenMatch) return;
    const tokenStart = cursor.ch - tokenMatch[1].length;
    editor.replaceRange(suggestion.insert, { line: cursor.line, ch: tokenStart }, cursor);
    this.popup?.hide();
  }

  injectStyles() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "styles.css";
    document.head.appendChild(link);
  }

  onunload() {
    if (this.modeSetupInterval !== null) window.clearInterval(this.modeSetupInterval);
    // @ts-ignore
    if (typeof CodeMirror !== "undefined") {
      // @ts-ignore
      delete CodeMirror.modes["prompt"];
      // @ts-ignore
      delete CodeMirror.modes["Prompt"];
    }
    this.popup?.destroy();
    document.getElementById("derpi-prompt-styles")?.remove();
  }
}

// needed for the editor-change event handler type
import * as obsidian from "obsidian";
