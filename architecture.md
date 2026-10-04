# Architecture Specification: TVO ILC Study Tool (Desktop & Web)

## 1. Executive Summary & Vision

The **TVO ILC Study Tool** is a high-performance, distraction-free study desktop and web platform that parses Independent Learning Centre (ILC) course packages into clean, structured Markdown, organizes them by unit and lesson, generates high-yield AI summaries and study notes, and provides interactive Ontario Curriculum (KICA)-aligned test materials.

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
     - **Cheatsheet**: Quick-reference table of key terms, statutory provisions, landmark cases, and rules vs. laws comparisons.
     - **Practice Test**: Interactive quiz runner for Ontario KICA-aligned questions (Knowledge & Understanding, Thinking & Investigation, Communication, Application) with instant scoring, feedback, and rationale reveals.
   - **Inline CodeMirror Editor**: Toggle between rich reading view and live Markdown editing with instant auto-save to disk.
   - **Incremental Chapter Additions**: An `[+] Add Chapters` button in the workspace subheader allows uploading new lesson `.zip` archives directly to the active course. Existing customized notes and edits are strictly preserved while new chapters are parsed and indexed.
3. **Prompts Engine (`/prompts`)**:
   - Customizable prompt templates for generating lesson summaries, cheatsheets, and KICA tests with dynamic placeholders (`{{lesson_title}}`, `{{content}}`, `{{unit}}`).
4. **Settings (`/settings`)**:
   - Data storage path configuration (default: `data/courses`).
   - LLM endpoint configuration (OpenAI-compatible, Ollama, Gemini, OpenRouter) with connection testing and selectable authentication header format (`Authorization: Bearer {key}`, `api-key: {key}`, or both).
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
│   │   └── <course_id>/        # e.g., clu3m
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
  "id": "clu3m",
  "title": "CLU3M: Understanding Canadian Law",
  "grade": "Grade 11",
  "level": "University/College Preparation",
  "description": "Explores Canadian law, constitutional rights, human rights, and the criminal justice system.",
  "units": [
    {
      "number": 1,
      "title": "Heritage & Legal Foundations",
      "lessons": [
        {
          "id": "01.02",
          "code": "clu3m_u1la2",
          "title": "1.2 Differentiating laws from rules",
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
title: "Learning activity 1.2: Differentiating laws from rules"
activityCode: "clu3m_u1la2"
courseId: "clu3m"
unit: "Heritage"
unitNumber: 1
lessonNumber: 2
sourceUrl: ""
savedAt: "2026-09-30"
---

> [!NOTE] Learning Goals
> - Appreciate the fundamental principles of justice
> - Explain what the concept "Rule of Law" means
> - Explain what factors influence the law

## Minds On

> [!TIP] **Think**
> What's the difference between a rule and a law?

...
```

### 3.3 Standardized Question Schema (`<unit>.<lesson>.test.md`)
Interactive practice tests follow human-readable Markdown with Ontario Secondary Curriculum (KICA) taxonomy:
```markdown
course: CLU3M.01.02

# Lesson 02: Differentiating Laws from Rules

## Questions
01) [Knowledge & Understanding] What is the fundamental difference between a rule and a law in Canadian society?
<Multiple-Choice>
- [ ] Rules are enforced by the courts; laws are enforced by private institutions.
- [ ] Laws apply to all members of society and are enforced by the government and courts; rules apply only to participants in specific groups or activities.
- [ ] Rules cannot be changed; laws change annually.
- [ ] Laws only apply to criminal matters; rules govern civil disputes.

--

02) [Thinking & Investigation] Which factor most significantly accounts for why Canadian copyright laws evolved following the proliferation of the internet?
<Multiple-Choice>
- [ ] Government mandates to increase tax revenue.
- [ ] Society's technological adoption changed public perceptions and behaviors regarding intellectual property.
- [ ] International treaties required eliminating all private copy rights.
- [ ] Supreme Court directives mandating digital obsolescence.

--

## Answers
01) B - (explanation) Laws are created by governments and apply to all members of a society, enforced by state apparatus (police, courts). Rules are created by private organizations or groups and only apply to individuals who participate in them.
02) B - (explanation) Laws evolve as society evolves; technological transformation shifts societal norms and economic realities, necessitating updated statutory frameworks.
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
updatedAt: '2026-10-03'
---

# Study Summary: Learning activity 1.2: Differentiating laws from rules
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
1. **Archive Inspector**: Reads `.zip` files from `data/courses/<course_id>/_backup/`.
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
5. **Study Suite Synthesizer**:
   - Generates initial high-yield `summary.md`, `cheatsheet.md`, and `test.md` aligned with the Ontario curriculum expectations.

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
     > [!USERNOTE] Why is this principle significant in Ontario law?
     > <!-- target: "statutory discretion must be exercised in good faith" -->
     > **Roncarelli v. Duplessis** established that statutory discretion cannot be arbitrary...
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


