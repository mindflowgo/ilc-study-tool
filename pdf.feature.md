# PDF Generator Feature Specification & Architecture

## 1. Executive Summary

The **PDF Generator** is a fast, client-side, zero-backend export engine that allows students and educators to generate and download publication-quality PDF study materials directly from the Course Study Workspace (`/courses/[course_id]`).

Every lesson document—**Course Notes (Full Lesson)**, **Summary**, **Cheatsheet**, and **Practice Test**—features a dedicated **`[PDF]`** button positioned directly adjacent to the existing **`[Edit]`** button. Clicking the button compiles the active document's markdown into a clean, print-optimized A4 PDF with curriculum headers, real vector text, tables, callouts, math, and a native save dialog — running entirely in the browser and desktop webview with no external processing.

---

## 2. Summary of Changes Made

### 2.1 Dependencies
- **Added `pdfmake` (`^0.3.11`)**: declarative, vector-text PDF engine (flowing layout, real tables, automatic pagination, headers/footers). Lazy-loaded only when a PDF is exported, so app startup is unaffected.
- **Removed `jspdf` and `html2canvas`**: the previous engine rasterized the whole document through html2canvas at 2× scale — slow, memory-heavy, and produced non-selectable image pages.
- **Added `@tauri-apps/plugin-dialog` + `@tauri-apps/api`** (frontend) and **`tauri-plugin-dialog` + `base64`** (Rust): native OS save dialog for choosing where the PDF lands (`dialog:default` capability).
- **Bundled DejaVu Sans / DejaVu Sans Mono TTFs** (`app/src/lib/pdf/assets/`): pdfmake's default Roboto lacks glyphs the courses actually use (→ ← ⇔ ✓ ✔ ☐ ± × ÷ − ≤ ≥ √ ⁿ ⁻ ᵃ ᵗ, Greek, ½ ⅓ — verified with fontkit). DejaVu covers 100% of the required set. Loaded lazily as hashed assets at export time.

### 2.2 Core PDF Export Engine (`app/src/lib/pdf/`)
A modular, DOM-free compiler pipeline — string-in / structured-content-out — so every piece is reusable for future exporters (course booklets, DOCX, print views):

| Module | Responsibility |
| --- | --- |
| `exportPdf.ts` | Public API `exportDocumentToPdf(options)`: orchestrates compile → image settle → render → save dialog. Logs per-stage timings (`[PDF] …`) to the console. |
| `types.ts` | Shared types (`PdfExportOptions`, `ImageSpec`, `ImageEmbedder`, `CompileContext`). |
| `theme.ts` | Page geometry (A4, margins), color palette, named pdfmake styles, callout/post-it themes. |
| `markdown/preprocess.ts` | Mirrors `MarkdownViewer`'s transforms: frontmatter strip, Pandoc image attrs, `assets/` → `/api/courses/{id}/assets/` rewrites, GFM callout + AI post-it extraction. |
| `markdown/mathText.ts` | LaTeX → readable Unicode text (`\frac{a}{b}` → `(a)/(b)`, `\sqrt{x}` → `√(x)`, superscripts/subscripts, Greek). Conservative inline-math detection keeps `$1,000` currency literal. Zero canvases. |
| `markdown/inline.ts` / `markdown/blocks.ts` | `marked.lexer` walk → pdfmake content: headings, nested/task lists, GFM tables with alignment, code blocks, blockquotes, `<details>` suggested answers (always unfolded), callout/post-it cards, figures with `![alt|size]` sizing (`xs/sm/md/lg/full`, `WxH`, `%`). |
| `quiz.ts` | `QuestionParser` output → exam sheet (Q-number, KICA category tag, ☐ checkboxes) + page-broken Answer Key grid and rationales. |
| `document.ts` | Full doc definition: curriculum header (dark course-code badge, course title with a smaller `v1 • Tab • date` line beneath, lesson title, divider), running header from page 2, compact right-aligned "Page X of Y" footer, PDF metadata, white page background. |
| `imageStore.ts` | Browser image pipeline: PNG/JPEG embedded byte-for-byte (no re-encode); GIF/SVG/WebP converted once via a tiny per-asset canvas (PDF only accepts rasters). Cached per URL, concurrency-limited, failures degrade to text placeholders. |
| `fontLoader.ts` / `pdfClient.ts` | Lazy pdfmake + DejaVu registration, cached singleton. |

**Output properties**: real selectable/searchable text (ToUnicode maps embedded), vector tables/lines, subset-embedded fonts, far smaller files than the raster pipeline, and the largest 30-page lesson compiles + renders in well under a second after the first export (engine + fonts warm). File naming is unchanged: `COU2M_01.02_Course_Notes.pdf`, `MHF4U_01.02_Summary.pdf`, etc.

### 2.3 Save Flow (prompt, not silent download)
- **Tauri (desktop)**: native save dialog (`tauri-plugin-dialog`) suggests the generated filename; the chosen path is written by a small `save_pdf_file` Rust command (base64 payload → `fs::write`, deliberately outside the fs-plugin ACL). No blob-anchor navigation is used inside Tauri, so the page never reloads after saving.
- **Plain browser**: File System Access `showSaveFilePicker` save prompt where supported (Chromium); otherwise a standard download.

### 2.4 User Interface (`app/src/routes/courses/[course_id]/+page.svelte`)
- `[PDF]` button unchanged (same placement, spinner state).
- `handleExportPDF` no longer queries the rendered DOM (`sourceElement` removed) — the export is compiled purely from the tab's markdown, so editor state, hover toolbars, and collapsed details can no longer leak into the output.

### 2.5 Component Header Spacing (`app/src/lib/components/QuizRunner.svelte`)
- Header right padding `pr-48 sm:pr-56` retained for the sticky `[PDF]` and `[Edit]` controls.

---

## 3. Rationale for Architectural Choices

### 3.1 Why vector pdfmake instead of html2canvas rasterization
- **Speed**: the old `doc.html()` path cloned the whole DOM and rasterized every page at 2× into giant canvases (seconds to tens of seconds, plus large memory spikes). The compiler walks markdown tokens and lets pdfmake lay out real text — measured on the biggest lesson (BAF3M 02.06, 30 pages): compile ≈ 375ms, render ≈ 435ms, ~160KB output.
- **Quality**: text is selectable, searchable (`Ctrl+F`), and copyable — the #1 requested improvement in the previous spec — because every glyph carries a ToUnicode map.
- **Determinism**: layout no longer depends on live DOM state; the same markdown always yields the same PDF.
- **Offline/desktop**: still 100% client-side, no backend, works under `adapter-static` in Tauri.

### 3.2 Math handling trade-off
Formulas render as linear Unicode text (via DejaVu's math coverage) rather than KaTeX's typeset HTML. For high-school formulas this stays highly readable (`x = (−b ± √(b² − 4ac)) / 2a`) and remains searchable; currency text (`$1,000`) is intentionally never treated as math. If pixel-perfect typeset math becomes a requirement, `mathText.ts` is a single swappable strategy.

### 3.3 Why not `markdown-pdfjs`
It is a thin wrapper over uncustomized `marked` + `html2pdf.js` (still jspdf + html2canvas underneath), so it inherits the raster performance problem and loses callouts, image sizing syntax, asset-path resolution, math handling, and the structured practice-test layout.

---

## 4. Future Improvements & Enhancements

1. **Course Booklet Export**: `compileMarkdownContent` + `buildDocDefinition` are already public building blocks; a booklet exporter can concatenate lessons and add a pdfmake table-of-contents page.
2. **Student vs. Teacher Practice Test Modes**: `compileQuizContent` can take a mode flag to omit or inline the answer key.
3. **Ink-Friendly / Monochrome Theme**: `theme.ts` centralizes every color; a mono palette swap is trivial.
4. **Typeset Math Strategy (optional)**: swap `mathText.ts` for a high-fidelity renderer if math-heavy courses (MHF4U/SPH4U) need stacked fractions and radicals.
5. **Engine Pre-warm**: optionally call `getPdfMake()` during app idle so even the first export skips the ~0.5s engine + font load.
