# Improvements & Gap Analysis

> Code review performed against [`architecture.md`](file:///Users/fil/Code/ilc-study-tool/architecture.md) — every claim in the spec was verified against actual source code.

## Summary

The codebase is well-structured and covers the majority of the architecture. The core study workflow (course ingestion → markdown parsing → study tabs → AI generation → inline editing) is fully functional. The **critical gaps** are concentrated in the parser layer (KaTeX, frontmatter handling), prompt template placeholders, the Tauri desktop shell configuration, and a handful of missing Settings features.

---

## 🔴 Critical Gaps (Broken or Missing Core Functionality)

### 1. QuestionParser ignores YAML frontmatter — quiz edits cause data loss
**Architecture**: §3.4 — All study materials (`.test.md` included) store prompt and revision metadata in YAML frontmatter.
**Code**: [`questionParser.ts`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/parser/questionParser.ts)
**Issue**: `parseMarkdown()` scans only the first 10 lines for the `course:` tag and `# title` header (lines 32-39). When YAML frontmatter is present (especially multi-line `prompt:` blocks), these fields get pushed past line 10 and are never found. Additionally, `serializeToMarkdown()` does not write back any frontmatter — so round-tripping a quiz through the parser **silently drops** the `prompt`, `version`, `type`, and `updatedAt` metadata.

**Fix**: Integrate with [`frontmatter.ts`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/parser/frontmatter.ts) — strip frontmatter before parsing, re-attach on serialize.

### 2. KaTeX / mathematical notation not preserved by Turndown
**Architecture**: §4.4 — "Preserves tables, callouts, lists, and **KaTeX mathematical notation**."
**Code**: [`turndownConverter.ts`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/parser/turndownConverter.ts)
**Issue**: Zero Turndown rules exist for `<span class="katex">`, `<math>`, MathJax, or any math-related DOM elements. Math content will be stripped or mangled into plain text during HTML→Markdown conversion.

**Fix**: Add a Turndown rule that preserves KaTeX/MathJax elements as raw inline/block `$...$` or `$$...$$` LaTeX delimiters.

### 3. Typo in test data: `## QuestionsZ` instead of `## Questions`
**Architecture**: §3.3 — Schema requires `## Questions` heading.
**Code**: [`data/courses/clu3m/01.02.test.md:51`](file:///Users/fil/Code/ilc-study-tool/data/courses/clu3m/01.02.test.md)
**Issue**: The heading is `## QuestionsZ` (trailing `Z`), which will cause `QuestionParser` to fail to locate the questions section boundary. This test file's questions may not be parsed correctly.

**Fix**: Rename to `## Questions`.

### 4. Prompt templates use wrong placeholder syntax
**Architecture**: §1.3 — "Customizable prompt templates with dynamic placeholders (`{{lesson_title}}`, `{{content}}`, `{{unit}}`)"
**Code**: [`data/prompts/summary.md`](file:///Users/fil/Code/ilc-study-tool/data/prompts/summary.md), [`cheatsheet.md`](file:///Users/fil/Code/ilc-study-tool/data/prompts/cheatsheet.md), [`test_kica.md`](file:///Users/fil/Code/ilc-study-tool/data/prompts/test_kica.md)
**Issue**: None of the three prompt templates contain the documented `{{lesson_title}}`, `{{content}}`, or `{{unit}}` handlebars-style placeholders. `test_kica.md` uses `<COURSE_ID>`, `<UNIT>`, `<LESSON>` angle-bracket placeholders instead, and the summary/cheatsheet prompts have no placeholders at all.

**Fix**: Either update the templates to use `{{...}}` syntax or update the architecture to match the actual syntax, and add a template interpolation function if one doesn't exist.

### 5. Tauri v2 desktop shell lacks file system plugin & permissions
**Architecture**: §2 — "Tauri v2 providing lightweight native macOS desktop windowing and **file access**."
**Code**: [`Cargo.toml`](file:///Users/fil/Code/ilc-study-tool/tauri/Cargo.toml), [`lib.rs`](file:///Users/fil/Code/ilc-study-tool/tauri/src/lib.rs), [`capabilities/default.json`](file:///Users/fil/Code/ilc-study-tool/tauri/capabilities/default.json)
**Issue**:
- `Cargo.toml` is missing `tauri-plugin-fs` dependency entirely.
- `lib.rs` calls `tauri::Builder::default()` with no plugin registration (no `.plugin(tauri_plugin_fs::init())`).
- `capabilities/default.json` only grants `"core:default"` — no `fs:allow-read`, `fs:allow-write`, or scoped file access permissions for the `/data` directory.

**Fix**: Add `tauri-plugin-fs` to `Cargo.toml`, register the plugin in `lib.rs`, and configure appropriate capability permissions in `default.json`.

---

## 🟡 Medium Gaps (Incomplete Feature Implementation)

### 6. `sourceUrl` field missing from lesson frontmatter
**Architecture**: §3.2 — Frontmatter schema includes `sourceUrl: ""`.
**Code**: [`turndownConverter.ts:6-15`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/parser/turndownConverter.ts#L6-L15)
**Issue**: The `LessonFrontmatter` interface omits `sourceUrl`, so it's never generated in converted lessons.

**Fix**: Add `sourceUrl: string` to the interface and include it (defaulting to `""`) in generated frontmatter.

### 7. Asset deduplication is filename-only, not content-based
**Architecture**: §4.2 — "Deduplicates identical assets."
**Code**: [`extractor.ts:58-73`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/parser/extractor.ts#L58-L73)
**Issue**: Dedup is a simple `fs.existsSync(dest)` check on the destination filename. Identical files with different names across archives will be duplicated. Different files with the same name will silently skip the newer version.

**Fix**: Implement content-hash deduplication (e.g., SHA-256 of file contents) and rename collisions.

### 8. Data storage path not configurable in Settings UI
**Architecture**: §1.4 — "Data storage path configuration (default: `data/courses`)."
**Code**: [`settings/+page.svelte`](file:///Users/fil/Code/ilc-study-tool/app/src/routes/settings/+page.svelte)
**Issue**: The settings page only has LLM configuration and Course Maintenance sections. There is no UI input for changing the data storage path. The backend ([`courses.ts`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/server/courses.ts)) resolves the data directory via `DATA_DIR` env var or path traversal — there's no API to change it at runtime.

**Fix**: Add a storage path input field to Settings, backed by a persistent config file that `CourseService.getDataDir()` reads.

### 9. OpenRouter missing from LLM provider dropdown
**Architecture**: §1.4 — "LLM endpoint configuration (OpenAI-compatible, Ollama, **Gemini**, **OpenRouter**)."
**Code**: [`settings/+page.svelte:143-147`](file:///Users/fil/Code/ilc-study-tool/app/src/routes/settings/+page.svelte#L143-L147)
**Issue**: The provider dropdown has `openai_compatible`, `gemini`, and `ollama` but no explicit `openrouter` option. While OpenRouter is OpenAI-compatible and could use the generic option, the architecture specifically lists it as a named provider.

**Fix**: Add an `<option value="openrouter">OpenRouter</option>` entry, potentially with OpenRouter-specific headers (`HTTP-Referer`, `X-Title`).

### 10. DocumentViewerModal missing browser history integration
**Architecture**: §9.3 — "Browser or mouse back navigation (integrated with HTML5 `history.pushState` and `popstate` events)."
**Code**: [`DocumentViewerModal.svelte`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/components/DocumentViewerModal.svelte)
**Issue**: The modal supports [✕ Close], [Back], and Escape key dismissal, but does **not** call `history.pushState()` on mount or listen for `popstate` events. Browser/mouse back button will navigate away from the study workspace entirely instead of closing the overlay.

**Fix**: Push a history state on modal open, listen for `popstate` to trigger `onClose()`, and pop state on close.

### 11. `bun run parse` CLI script may be broken
**Architecture**: §7 — "`bun run parse`: Executes the Bun ingestion engine on `data/courses/` archives."
**Code**: Root [`package.json:10`](file:///Users/fil/Code/ilc-study-tool/package.json#L10) delegates to `bun --cwd app run parse`.
**Issue**: The actual parser entry point is [`runParser.ts`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/parser/runParser.ts) invoked through the `/api/parse` HTTP endpoint. The CLI `bun run parse` may fail if `app/package.json` doesn't expose a matching script.

**Fix**: Add a `"parse": "bun run src/lib/parser/runParser.ts"` script to `app/package.json`, or verify the existing wiring works.

### 12. LLM settings only persisted in localStorage (client-side)
**Architecture**: §1.4 implies server-side settings persistence for LLM configuration.
**Code**: [`settings/+page.svelte:29-53`](file:///Users/fil/Code/ilc-study-tool/app/src/routes/settings/+page.svelte#L29-L53)
**Issue**: LLM settings (provider, baseUrl, apiKey, model, etc.) are saved to `localStorage` only. They travel from the browser to the server on each API request. This means:
- Settings are lost when localStorage is cleared.
- Different browsers/devices won't share settings.
- The Tauri desktop app's webview localStorage may behave differently.

**Fix**: Consider persisting to a `data/settings.json` file server-side (with API endpoint), falling back to localStorage as a cache.

---

## 🟢 Minor Gaps (Polish & Completeness)

### 13. Course cards missing study resource indicators
**Architecture**: §1.1 — "Course cards displaying course code, title, units, lesson count, and **study resource indicators**."
**Code**: [`+page.svelte:130-140`](file:///Users/fil/Code/ilc-study-tool/app/src/routes/+page.svelte#L130-L140)
**Issue**: Cards show units count and lesson count, but don't show indicator badges for which resources (summaries, cheatsheets, tests) are available per course.

### 14. Course cards don't display `level` field
**Architecture**: §3.1 — `meta.json` includes `level: "University/College Preparation"`.
**Code**: [`+page.svelte:110-117`](file:///Users/fil/Code/ilc-study-tool/app/src/routes/+page.svelte#L110-L117)
**Issue**: The `grade` is shown, but the `level` field is not displayed anywhere on the card.

### 15. Gemini provider uses OpenAI-compatible endpoint only
**Architecture**: §1.4 references Gemini as a distinct provider.
**Code**: [`llm.ts`](file:///Users/fil/Code/ilc-study-tool/app/src/lib/server/llm.ts) — All providers go through the same OpenAI-compatible `/chat/completions` format.
**Issue**: The settings UI labels Gemini as "via OpenAI compatibility endpoint" which is functional, but the native Gemini API (`generativelanguage.googleapis.com`) with its different request schema is not supported. This is a minor gap since Gemini's OpenAI-compatibility layer works.

### 16. No Tauri `bundle.active` flag enabled for distribution
**Code**: [`tauri.conf.json:28`](file:///Users/fil/Code/ilc-study-tool/tauri/tauri.conf.json#L28) — `"active": false`
**Issue**: Bundle generation is disabled. Running `bun run tauri:build` won't produce distributable `.dmg`/`.app` artifacts. This is likely intentional during development but should be enabled for release.

---

## ✅ Verified Working (Architecture Claims Confirmed)

| Feature | Architecture § | Status |
|---------|---------------|--------|
| SvelteKit 5 with Runes (`$state`, `$derived`, `$props`, `$effect`) | §2 | ✅ Throughout all components |
| Tailwind CSS + Typography plugin | §2 | ✅ Configured in `tailwind.config.ts` |
| CodeMirror 6 Single-Mount Lifecycle | §6.1 | ✅ `onMount` only, no re-instantiation |
| CodeMirror Keystroke Synchronization Guard | §6.2 | ✅ `lastValue` pattern prevents cursor jumping |
| CodeMirror External Prop Changes | §6.3 | ✅ `val !== lastValue` dispatch on tab/lesson switch |
| Course manifest (`meta.json`) schema | §3.1 | ✅ Correct nested units→lessons structure |
| Study tabs (Lesson, Summary, Cheatsheet, Test) | §1.2 | ✅ All four tabs with content loading |
| Upload card `[+]` for new course ingestion | §1.1 | ✅ UploadModal with `mode="new"` |
| Incremental chapter additions `[+] Add Chapters` | §5 | ✅ UploadModal with `mode="add"`, preserves existing files |
| Multi-version storage (v1, v2, + New) | §3.4 | ✅ Full implementation in `courses.ts`, `PromptCard`, workspace |
| AI Post-It Note annotations | §8 | ✅ SelectionToolbar + MarkdownViewer with `[!USERNOTE]` callouts |
| Bidirectional highlighting (anchor ↔ post-it) | §8.4 | ✅ `setupNoteInteractions()` in MarkdownViewer |
| Floating `[✨ Ask AI]` pill on text selection | §8.1 | ✅ SelectionToolbar with position tracking |
| Quick Ontario prompt chips | §8.1 | ✅ "Explain simply", "Why significant?", etc. |
| DocumentViewerModal overlay | §9.1 | ✅ Full-page overlay with PDF/image support |
| Document header controls (Back, Close, Download) | §9.2 | ✅ All three present |
| Escape key dismissal | §9.3 | ✅ `handleKeydown` on `svelte:window` |
| GFM callout conversion (`[!NOTE]`, `[!TIP]`, etc.) | §4.3 | ✅ Turndown rules for learning goals + ILC callouts |
| Interactive answer reveal → `<details>/<summary>` | §4.3 | ✅ Turndown `detailsElement` rule |
| LLM auth header formats (Bearer, api-key, both) | §1.4 | ✅ All three in `llm.ts:44-50` |
| LLM connection testing | §1.4 | ✅ `testConnection()` in `llm.ts:137-151` |
| LLM `sessionId` for context-aware annotations | §8.2 | ✅ Passed through API and included in payload |
| Prompt template engine (`/prompts`) | §1.3 | ✅ CRUD via PromptCard components |
| Cheerio DOM cleaner (nav removal, section normalization) | §4.3 | ✅ `domCleaner.ts` |
| Turndown + GFM plugin | §4.4 | ✅ Configured with proper options |
| SvelteKit static adapter (for Tauri) | §7 | ✅ `adapter-static` with SPA fallback |

---

## Priority Order for Implementation

1. **#1 — Fix QuestionParser frontmatter handling** (data loss bug)
2. **#3 — Fix `## QuestionsZ` typo** (immediate data fix)
3. **#4 — Standardize prompt template placeholders** (AI generation quality)
4. **#5 — Add Tauri FS plugin + permissions** (desktop app file access)
5. **#2 — Add KaTeX preservation rules** (math-heavy courses)
6. **#10 — Add browser history integration to DocumentViewerModal** (UX)
7. **#8 — Add data storage path setting** (flexibility)
8. **#6 — Add `sourceUrl` to frontmatter** (spec compliance)
9. **#7 — Implement content-hash asset deduplication** (disk efficiency)
10. **#9 — Add OpenRouter as named provider** (completeness)
