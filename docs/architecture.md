# Architecture Specification: Course Study Tool (Desktop & Web)

## 1. Executive Summary & Vision

The **Course Study Tool** is a high-performance, distraction-free study desktop and web platform that parses Independent Learning Centre (ILC) course packages into clean, structured Markdown, organizes them by unit and lesson, generates high-yield AI summaries and study notes, and provides interactive Ontario Curriculum (KICA)-aligned test materials.

All content is stored in a transparent, flat Markdown filesystem with zero external database dependencies. Inline editing is powered by the **CodeMirror 6** Markdown editor, allowing students to refine their notes and tests directly.

### Core Features:
1. **Courses Dashboard (`/`)**:
   - Course cards displaying course code, title, units, lesson count, and study resource indicators.
   - An upload card `[+]` allowing ingestion of course blocks (zip format or directory) into lessons and assets.
2. **Course Study Workspace (`/courses/[course_id]`)**:
   - **Lesson Navigation**: Header selector dropdown organized by Unit & Lesson with Previous / Next navigation.
   - **Study Tabs**:
     - **Full Lesson**: The parsed lesson content rendered with clean typography, GFM callout boxes (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`), expandable suggested answers, and diagrams.
     - **Summary**: High-yield AI summary synthesizing core principles, legal definitions, and Ontario expectations.
     - **Cheatsheet**: Quick-reference table of key terms, etc.
     - **Practice Test**: Interactive quiz runner for Ontario KICA-aligned questions (Knowledge & Understanding, Thinking & Investigation, Communication, Application) with instant scoring, feedback, and rationale reveals.
   - **Inline CodeMirror Editor**: Toggle between rich reading view and live Markdown editing with instant auto-save to disk.
   - **Incremental Chapter Additions**: An `[+] Add Chapters` button in the workspace subheader allows uploading new lesson `.zip` archives directly to the active course. Existing customized notes and edits are strictly preserved while new chapters are parsed and indexed.
3. **Prompts Engine (`/prompts`)**:
   - Customizable prompt templates for generating lesson summaries, cheatsheets, and KICA tests with dynamic placeholders (`{{lesson_title}}`, `{{content}}`, `{{unit}}`).
4. **Settings (`/settings`)**:
   - Data storage path configuration (default: `data/courses`).
   - LLM endpoint configuration (OpenAI-compatible, Ollama, Gemini, OpenRouter) with connection testing.
   - Manual re-index and re-parse triggers.

---

## 2. High-Level System Architecture & Tech Stack

- **Runtime & Installer**: **Bun** (fastest package manager, script runner, and backend runtime)
- **Desktop Shell**: **Tauri v2** (`/tauri`) providing lightweight native macOS desktop windowing and file access
- **Frontend Framework**: **SvelteKit 5** with modern **Runes** (`$state`, `$derived`, `$props`, `$effect`) in `/app`
- **Styling**: **Tailwind CSS** with Typography plugin for clean, minimalist, high-legibility study aesthetics
- **Markdown & Code Editor**: **CodeMirror 6** (`@codemirror/lang-markdown`, `@codemirror/view`)
- **Extraction Engine**: Bun + **Cheerio** (DOM parsing & asset extraction) + **Turndown** with **GFM Plugin** (semantic Markdown conversion)
- **Data Persistence**: Flat filesystem in `/data` (Single Source of Truth, no database required)

```
ilc-study-tool/
├── architecture.md             # Consolidated system architecture specification
├── package.json                # Root Bun package script coordinator
├── data/
│   ├── courses/
│   │   └── <course_id>/        # e.g., cou2m
│   │       ├── _backup/        # Original course HTML/ZIP archives
│   │       ├── meta.json       # Course metadata & units/lessons index
│   │       ├── assets/         # Extracted diagrams, images, and locker documents
│   │       │   ├── img/
│   │       │   ├── icons/
│   │       │   └── locker_docs/
│   │       ├── 01.02.lesson.md # Full lesson markdown
│   │       ├── 01.02.summary.md# High-yield study summary
│   │       ├── 01.02.cheatsheet.md # Quick reference cheatsheet
│   │       ├── 01.02.test.md   # Interactive KICA practice quiz
│   │       └── ...
│   └── prompts/
│       ├── summary.md          # Default prompt for lesson summarization
│       ├── cheatsheet.md       # Default prompt for cheatsheets
│       └── test_kica.md        # Default prompt for KICA question generation
├── app/                        # SvelteKit 5 + Tailwind App
│   ├── package.json            # Managed by Bun
│   ├── svelte.config.js        # SvelteKit 5 configuration
│   ├── vite.config.ts          # Vite configuration
│   ├── tailwind.config.ts      # Tailwind CSS configuration
│   └── src/
│       ├── lib/
│       │   ├── components/     # Svelte 5 components (Header, MarkdownViewer, CodeMirrorEditor, QuizRunner, UploadModal)
│       │   ├── parser/         # Extraction engine (Cheerio + Turndown + Asset pipeline + Incremental ingester)
│       │   └── server/         # File access repository and LLM service
│       └── routes/             # SvelteKit routes (+layout, /, /courses/[id], /prompts, /settings, /api)
└── tauri/                      # Tauri v2 Desktop App
    ├── Cargo.toml              # Tauri v2 dependency declarations
    ├── tauri.conf.json         # Tauri v2 window & build configuration
    ├── capabilities/           # Security & permission capabilities
    └── src/                    # Rust entrypoint
```

---

## 3. Data Model & File Schemas

### 3.1 Course Manifest (`meta.json`)
```json
{
  "id": "cou2m",
  "title": "COU2M: Course Title",
  "grade": "Grade 10",
  "level": "University/College Preparation",
  "description": "Explores the content of this course.",
  "units": [
    {
      "number": 1,
      "title": "Unit 1 Course Content",
      "lessons": [
        {
          "id": "01.02",
          "code": "cou2m_u1la2",
          "title": "1.2 Insights into Content",
          "type": "lesson",
          "hasFull": true,
          "hasSummary": true,
          "hasCheatsheet": true,
          "hasTest": true
        }
      ]
    }
  ]
}
```

### 3.2 Lesson Markdown (`<unit>.<lesson>.lesson.md`)
Carries YAML frontmatter for provenance and metadata:
```markdown
---
title: "Learning activity 1.2"
activityCode: "cou2m_u1la2"
courseId: "cou2m"
unit: "Unit"
unitNumber: 1
lessonNumber: 2
sourceUrl: ""
savedAt: "2025-09-30"
---

> [!NOTE] Learning Goals
> - Appreciate the fundamental principles of course
> - Explain what the concept "XYZ" means
> - Explain what factors influence the rule

## Minds On

> [!TIP] **Think**
> What's the difference between a X and Y?

...
```

### 3.3 Standardized Question Schema (`<unit>.<lesson>.test.md`)
Interactive practice tests follow human-readable Markdown with Ontario Secondary Curriculum (KICA) taxonomy:
```markdown
course: COU2M.01.02

# Lesson 02: Differentiating X from Y

## Questions
01) [Knowledge & Understanding] What is the fundamental difference between X and Y?
<Multiple-Choice>
- [ ] Statement 1.
- [ ] Statement 2.
- [ ] Statement 3.
- [ ] Statement 4.

--

02) [Thinking & Investigation] Going deeper into concepts of ZZZ?
<Multiple-Choice>
- [ ] Government mandates to increase tax revenue.
- [ ] Society's technological adoption changed public perceptions and behaviors regarding intellectual property.
- [ ] International treaties required eliminating all private copy rights.
- [ ] Supreme Court directives mandating digital obsolescence.

--

## Answers
01) B - (explanation) 
02) B - (explanation) 
```

### 3.4 Study Material YAML Frontmatter & Multi-Versioning Schema
All generated study materials (`.summary.md`, `.cheatsheet.md`, `.test.md`) store their AI prompt instructions and revision metadata in standard YAML frontmatter (`--- ... ---`):

```markdown
---
prompt: |
  # ILC Lesson Summary Generation Prompt
  You are an expert Ontario Secondary School educator...
type: summary
version: 1
updatedAt: '2025-10-03'
---

# Study Summary: Learning activity 1.2
...
```

#### Multi-Version Storage
When students experiment with alternative prompts or regenerate study materials:
- **v1 (Initial)**: `<lessonId>.<tab>.md` (e.g., `01.02.summary.md`)
- **v2 (Revision 2)**: `<lessonId>.<tab>-2.md` (e.g., `01.02.summary-2.md`)
- **vN (Revision N)**: `<lessonId>.<tab>-N.md` (e.g., `01.02.summary-N.md`)

The UI provides clean pill buttons (`[ v1 ] [ v2 ] [ + New ]`) allowing students to switch between versions instantaneously. When re-generating with AI, users choose whether to overwrite the active version or branch into a new version.

---

## 4. Extraction & Ingestion Pipeline

The Bun extraction pipeline (`src/lib/parser/`):
1. **Archive Inspector**: Reads `.zip` files from `data/courses/<course_id>/_backup/` using **`fflate`** — a fast pure-JS zip codec chosen because it survives `bun build --compile` (native zip libs like `zip-bun` JIT-compile C bindings at runtime and crash inside compiled binaries; `adm-zip` compiles but is 5-10x slower).
2. **Asset Pipeline**:
   - Extracts images (`.jpg`, `.png`, `.svg`) to `data/courses/<course_id>/assets/img/`.
   - Extracts locker documents and PDFs to `data/courses/<course_id>/assets/locker_docs/`.
   - Deduplicates identical assets.
3. **Cheerio DOM Cleaner**:
   - Removes navigation wrappers, Brightspace D2L chrome, scripts, and trackers.
   - Extracts `#ilcLearningGoals` and formats into standard GFM callouts (`> [!NOTE]`).
   - Normalizes sections (`#mindsOn`, `#action`, `#consolidation`) into semantic markdown headings.
   - Converts interactive answer reveal buttons (`.btn-answer-reveal`) into native collapsible `<details><summary>Suggested Answer</summary>...</details>`.
   - Rewrites image and document `href`/`src` paths to local relative asset paths.
4. **Turndown Markdown Converter**:
   - Uses `turndown` + `turndown-plugin-gfm` to generate crisp Markdown.
   - Preserves tables, callouts, lists, and KaTeX mathematical notation.
   - YAML frontmatter is written with the **`Bun.YAML`** runtime builtin (parse + stringify; note: `stringify` emits flow style with no trailing newline, so serializers append `\n` before the closing `---`).
5. **Study Suite Synthesizer**:
   - Generates initial high-yield `summary.md`, `cheatsheet.md`, and `test.md` aligned with the Ontario curriculum expectations.
6. **Image Optimizer** (`src/lib/parser/imageOptimizer.ts`, runs at the end of every ingest):
   - Any raster image wider than **512px** is resized (aspect preserved) and re-encoded as **JPEG q82** via the **`Bun.Image`** runtime builtin — no native npm dependency, so it works inside the compiled sidecar binary.
   - Markdown references are rewritten to the new `.jpg` filenames, Pandoc `{width=…}` attributes are normalized to pipe syntax, and any image that would display wider than 50% of the reading column gets an explicit `|50%` spec.
   - Also exposed via `POST /api/maintenance/compress-images` (Settings → "Compress Course Images") and `bun run scripts/compress_course_images.ts`.

---

## 5. Incremental Chapter & Lesson Ingestion

When new course chapters or lessons are added:
1. **Targeted Ingestion**:
   - New `.zip` archives are saved to `data/courses/<course_id>/_backup/`.
   - The ingester checks each lesson file: if `${lessonId}.lesson.md` already exists, it is **preserved** to prevent overwriting student notes, user edits, or custom summaries.
   - Only newly added lesson archives are extracted, parsed into markdown, and populated with initial study summaries, cheatsheets, and tests.
2. **Manifest Synchronization**:
   - Existing metadata (custom titles, descriptions, unit names) in `meta.json` is preserved.
   - New lessons are categorized into their corresponding units (or new units are created dynamically).
   - The frontend dropdown updates immediately to show the newly available chapters.

---

## 6. CodeMirror 6 & Svelte 5 Lifecycle Integration

In Svelte 5, reactive effects (`$effect`) track all synchronous signals read within them. To avoid cursor-jumping and editor re-instantiation on keystrokes:
1. **Single Mount Lifecycle**:
   - `EditorView` is created strictly inside `onMount` (or `untrack`). It is instantiated once and destroyed only when unmounting.
2. **Keystroke Synchronization Guard**:
   - As the user types inside CodeMirror, `EditorView.updateListener` updates an internal tracking variable `lastValue` before invoking `onChange(newDoc)`.
   - When the parent's reactive state changes in response, the component's `$effect` checks `if (val !== lastValue)`. Because `val` matches `lastValue`, CodeMirror is NOT modified from the outside, preserving the user's cursor position and undo history seamlessly.
3. **External Prop Changes**:
   - When switching tabs (e.g. from `lesson` to `summary` or changing lessons), `val !== lastValue` evaluates to true, dispatching the document change and preserving or clamping the selection.

---

## 7. Tauri v2 Desktop Runner & Commands

The project root coordinates both the SvelteKit 5 web app and Tauri v2 desktop application through Bun:
- `bun run dev`: Runs Vite dev server for web testing (`http://localhost:5173`).
- `bun run build`: Typechecks and builds production bundles via SvelteKit.
- `bun run parse`: Executes the Bun ingestion engine on `data/courses/` archives.
- `bun run tauri:dev`: Builds the SvelteKit app and launches the native Tauri v2 macOS desktop window.
- `bun run check`: App svelte-check **plus** `tsc --noEmit` over `server/index.ts` and shared server modules (root `tsconfig.json`, `@types/bun`) — a broken sidecar can never pass CI.
- `bun run test`: Sidecar API contract tests (`scripts/api-contract.ts`) plus the PDF pipeline smoke test.
- `bun run server:compile`: Produces the standalone sidecar binary `tauri/server` (`.exe` on Windows) via `bun build --compile`.
- `bun run tauri:build:win` / `tauri:build:mac`: Platform bundles (`--bundles nsis` / `dmg`); `bundle.resources: ["server*"]` picks up whichever binary name the platform produced.

### 7.1 Backend Sidecar & the Single API Layer
Packaged desktop builds have no SvelteKit server, and the dev/web app has no compiled sidecar — both serve the **same HTTP API from one implementation**:
- **`app/src/lib/server/api.ts`** exports a framework-agnostic `handleApiRequest(req, url) → Response` covering every endpoint (courses, lessons, assets, queue, prompts, LLM, parse/ingest, course-docs, backups, storage/theme settings, image compression). It is the *only* place endpoint logic lives.
- **SvelteKit side**: a single catch-all adapter (`src/routes/api/[...path]/+server.ts`, 3 lines per verb) delegates to the shared handler during `bun run dev` and web builds.
- **Sidecar side**: `server/index.ts` compiles to a standalone executable (`tauri/server` / `server.exe`) and delegates to the same handler, adding only the loopback transport, CORS for Tauri webview origins, and SPA static serving. If its port is already owned by another instance it exits cleanly instead of crashing.
- **Frontend**: `apiFetch(path, init)` (`app/src/lib/api.ts`) applies the environment base URL (dev server vs `http://127.0.0.1:3182`) at every call site. The old global `window.fetch` monkey-patch (`initApiInterceptor`) is gone; `isTauriEnvironment()` is the single environment detection export.
- **Compiled-binary-safe dependencies only**: `Bun.Image` (compression), `Bun.YAML` (frontmatter), `fflate` (zip). Native npm modules (sharp, zip-bun) cannot load inside `bun build --compile` executables and must not be added to this path.
- **Hardened spawn** (`tauri/src/lib.rs`): per-platform binary lookup (`server`/`server.exe` in resources and beside the executable, bun fallback including `%USERPROFILE%\.bun\bin\bun.exe`), stdout/stderr captured to `<data_dir>/backend.log`, spawn failures logged, and the main window is held back until the backend port answers (10s cap) so the UI never appears before the API is reachable.
- **Loopback-only**: the sidecar binds `127.0.0.1` and emits CORS headers solely for recognized origins (localhost/127.0.0.1 ports and the Tauri webview origins `tauri://localhost` / `http://tauri.localhost`).

### 7.2 Verification gates (root scripts)
- `bun run check` — app svelte-check **plus** `tsc --noEmit` over the sidecar and shared server modules.
- `bun run test` — three suites: `scripts/api-contract.ts` (response-shape contracts), `scripts/sidecar-e2e.ts` (ingest → save → save-as-new-version → course-docs → theme → backup roundtrip against a live sidecar on scratch data), and the PDF pipeline smoke test.

### 7.3 Audit findings — resolution status
- ✅ **Sidecar type errors / contract drift** (queue `addTasks`, `getAllPrompts`, `collectLessonDocs`, missing `/api/parse`, `saveLessonTab` signature, duplicate `success` key): fixed, and structurally prevented going forward — dev server and sidecar now share one handler (`api.ts`).
- ✅ **Frontmatter parsing** (YAML frontmatter + 25-line title scan): fixed; frontmatter is read/written with `Bun.YAML` (round-trip covered by e2e).
- ✅ **Fetch monkey-patch** (`initApiInterceptor`): removed; replaced by typed `apiFetch` at all 34 call sites.
- ⏳ **CSP `script-src 'unsafe-inline'`** (`tauri.conf.json`): known weakness, kept as a follow-up (needs SvelteKit nonce/hash-based CSP support).
- The full historical audit log with per-item detail remains in `docs/improvements.md`.

---

## 8. In-Place Text Selection & AI Post-It Note Annotations

Students reading any course material (Full Lesson, Summary, Cheatsheet) can highlight or select text to ask contextual AI questions and attach persistent notes directly to the Markdown document.

### 8.1 Workflow & Interaction Model
1. **Highlight & Floating Trigger**:
   - Selecting text within the reader pane activates a floating `[ ✨ Ask AI ]` pill positioned at selection coordinates.
   - Clicking opens an AI query modal with an excerpt preview, custom question input, and 4 quick Ontario prompt chips (*"Explain simply"*, *"Why significant?"*, *"Exam takeaway"*, *"Real-world example"*).
2. **Context-Aware Prompting**:
   - The request dispatches to `/api/llm` with `sessionId: "${courseId}-note"`.
   - The model receives the full lesson material as background context while prioritizing the specific excerpt and the student's question.
3. **Markdown Callout Storage**:
   - The answer is inserted after the annotated paragraph as a standard GFM callout:
     ```markdown
     > [!USERNOTE] Why is this principle significant in XY?
     > <!-- target: "statutory discretion must be exercised in good faith" -->
     > **Concept XYZ** deeper explanation here...
     ```
   - Standard GFM callout syntax guarantees 100% interoperability with external Markdown editors and the built-in CodeMirror editor.
4. **Interactive Reader View & Bidirectional Highlighting**:
   - In reader mode, the note renders as a warm amber Post-It note card.
   - The target snippet in the paragraph above is underlined with a dotted amber anchor (`<mark class="ai-note-anchor">`).
   - Hovering over either the post-it note or the anchor text triggers synchronized highlighting.
   - Clicking the anchor text smoothly scrolls to and expands the post-it note.
   - Each note includes an inline `[✕]` action allowing instant deletion with disk synchronization.

---

## 9. Full-Page Document & PDF Viewer (`DocumentViewerModal`)

When students click links to curriculum PDF worksheets, reference documents (e.g., *Canadian Charter of Rights and Freedoms* in `assets/locker_docs/`), or diagrams in the lesson Markdown:
1. **In-App Full-Page Overlay**:
   - Instead of navigating the entire browser or Tauri webview away from the study workspace, the click is intercepted.
   - Opens a dedicated, full-screen document overlay (`DocumentViewerModal.svelte`).
2. **Persistent Header Controls**:
   - Displays the document title, file type badge (`PDF Document` / `Image`), and course title.
   - Includes a **`[Back]`** button and a prominent **`[✕ Close]`** button that returns directly to the exact lesson scroll position.
   - An external **`[Download]`** button allows saving the file or opening it in native desktop PDF viewers (Preview, Adobe Acrobat).
3. **Multi-Modal Dismissal**:
   - Students can dismiss the viewer and return to the lesson via:
     - The top-bar **`[✕ Close]`** or **`[Back]`** button.
     - The **`Escape`** keyboard shortcut.
     - Browser or mouse back navigation (integrated with HTML5 `history.pushState` and `popstate` events).

---

## 10. Multi-Format Lesson Ingestion Engine (.zip, .mhtml, .html)

To support courses where lessons cannot be directly downloaded as standard SCORM packages, the ingestion engine seamlessly accepts browser-saved formats:

### 10.1 Supported File Types
1. **Standard Zip Packages**:
   - `cou2m_u1la2.html.zip` (original course package format).
2. **Browser-Saved "Webpage, Complete" Zip Archives**:
   - `<Title>.html` or `<Title>.htm` paired with `<Title>_files/` directory zipped together (e.g. `Learning activity 1.1 Introduction to XYZ.zip`).
   - Automatically detects and parses inner `intermediate.html` SCORM iframes.
   - Extracts all local images, SVGs, and PDFs from `_files/` into standardized `assets/img/`, `assets/icons/`, and `assets/locker_docs/`.
3. **Single File Web Archives (.mhtml / .mht)**:
   - MIME multipart documents saved directly via Chrome, Edge, or Safari (e.g. `Learning activity 1.2_ Types of widgets.mhtml`).
   - Parses multipart boundaries, quoted-printable text, and base64-encoded binary attachments.
   - Extracts embedded diagrams and illustrations directly to disk and normalizes image `src` references.
4. **Standalone HTML Files & Companion Folders**:
   - `.html` files placed alongside companion `_files` directories.

### 10.2 Robust Unit & Lesson Metadata Resolution
- Resolves unit numbers, lesson numbers, activity codes, and titles across divergent naming conventions (`u1la1`, `Learning activity 1.1`, `1.2 Types of widgets`, or internal SCORM manifests).
- Automatically converts root-level package files in `data/courses/<course_id>/` into `_backup/` for clean revision history and persistence.

---

## 11. Image Resizing & Interactive Scaling Controls

Lesson content imported from brightspace or web downloads often contains oversized diagrams, balance sheets, and high-resolution screenshots that disrupt the reading flow. The tool provides both standard Markdown syntax extensions and interactive on-the-fly reader controls:

### 11.1 Markdown Sizing Syntax Conventions
1. **Obsidian / Logseq Pipe Syntax**:
   - `![Alt Text|300](./assets/img/diagram.png)` -> Fixed width `300px`
   - `![Alt Text|50%](./assets/img/chart.png)` -> Responsive width `50%`
   - `![Alt Text|400x250](./assets/img/flow.png)` -> Width `400px`, height `250px`
   - `![Alt Text|small](./assets/img/badge.png)` -> Named preset (`xs`: 160px, `sm`/`small`: 280px, `md`/`medium`: 480px, `lg`/`large`: 720px, `xl`/`full`: 100%)
   - `![Alt Text|width=350px,height=200px](./assets/img/sheet.png)` -> Key-value parameters
2. **Pandoc / Markdown-it Attribute Syntax**:
   - `![Alt Text](./assets/img/diagram.png){width=350px}`
   - `![Alt Text](./assets/img/chart.png){50%}`
   - `![Alt Text](./assets/img/flow.png){400x250}`
3. **Standard HTML**:
   - `<img src="./assets/img/diagram.png" width="350" />` or `style="width: 50%;"`

### 11.2 Interactive Reader Controls
1. **Sensible Default Constraints**:
   - Unconstrained images default to `max-height: 480px; width: auto; object-fit: contain;` centered within the reading pane, preventing tall or ultra-wide images from overwhelming the lesson text.
2. **Floating Quick-Scale Toolbar**:
   - Hovering over any content image presents a floating action pill in the top-right corner:
     `[ Size: Auto | 25% | 50% | 75% | 100% | ⛶ Full ]`
   - Clicking a percentage chip (`25%`, `50%`, `75%`, `100%`) dynamically resizes the image immediately in real-time.
   - Clicking `Auto` resets the image to the default balanced container fit.
   - Tooltips on each chip display the corresponding Markdown syntax to make learning the syntax seamless.
3. **Full-Page Zoom & Inspection**:
   - Clicking **`[⛶ Full]`** or clicking directly on the image opens it in the full-page `DocumentViewerModal`, enabling pan/zoom, high-detail inspection, and downloading.
4. **Intelligent Icon Detection**:
   - SVG icons, buttons, and badges (`assets/icons/`, `think.svg`, `rubric_button.svg`) are automatically styled inline without giant margins or scale toolbars, keeping curriculum navigation crisp and uncluttered.

---

## 12. CodeMirror Live Preview (Obsidian-Style WYSIWYG Editor)

Adapted from the architecture in `nuza`, the CodeMirror editor (`app/src/lib/editor`) provides an **Obsidian-style Live Preview** writing experience directly in the study tool:

### 12.1 Interactive In-Place Markdown Rendering
1. **Headings (`#`, `##`, `###`)**:
   - Render with authentic proportional scale, weight, and hierarchy.
   - When the cursor is off the line, the leading `#` hashes disappear.
   - Placing the caret anywhere on the line reveals the `#` hashes dimmed (`cm-md-mark`), allowing immediate editing without breaking layout.
2. **Inline Formatting (Bold, Italic, Strikethrough, Inline Code)**:
   - Formatted inline as rich text (`**bold**` as bold, `*italic*` as italic, `` `code` `` as a styled chip).
   - Markdown markers fold away when not selected and reveal smoothly when the cursor touches the word or line.
3. **Links (`[title](url)`)**:
   - Rendered as blue styled links with subtle underlines.
   - The URL and brackets hide when the cursor is elsewhere.
   - **Mod-Click** (`Cmd-Click` on macOS, `Ctrl-Click` on Windows/Linux) opens links in a new browser tab.
4. **Lists & Tasks**:
   - Bullet items (`- `, `* `) render with clean glyphs (`•`, `◦`, `▪`).
   - Tasks (`- [ ]`, `- [x]`) render as interactive, clickable checkboxes. Clicking the checkbox toggles `[ ]` $\leftrightarrow$ `[x]` directly in the underlying Markdown text with smooth animated transitions.
   - Checked tasks automatically gain line strikethrough.
   - Pressing **`Enter`** automatically continues the list or task, and renumbers ordered lists. Pressing **`Enter`** on an empty item cleanly exits the list.
5. **Interactive GFM Tables**:
   - Render as formatted HTML tables with borders, headers, and column alignments.
   - Clicking any cell turns it into an editable field right inside the table, saving changes back to the Markdown document. Double-clicking reveals the raw Markdown table.
6. **Images (`![alt](url)`)**:
   - Render live inside the editor with support for both web URLs and course assets (`./assets/...` resolved to `/api/courses/${courseId}/assets/...`).
   - Respects Obsidian pipe sizing (`![alt|300](url)`, `![alt|50%](url)`).
7. **YAML Frontmatter (`---`)**:
   - Renders as a structured Properties form displaying key-value metadata, with inline editing, deletion, and property additions. Placing the cursor inside reveals the raw YAML text.





