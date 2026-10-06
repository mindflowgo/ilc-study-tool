# Improvements & Security/Architecture Audit

> Comprehensive system audit and status tracking verified against source code and runtime behaviors.

## Executive Summary

A thorough review and remediation across the entire stack resolved critical security vulnerabilities, architectural flaws, AI queue deadlocks, and parser data-mangling defects:
1. **Security**: Eliminated shell command injection (`open/+server.ts`), arbitrary file write/traversal vulnerabilities (`server/paths.ts`), stored XSS in MarkdownViewer (DOMPurify integration), and removed client-side plaintext API keys from `localStorage`.
2. **Parser & Math Rendering**: Fixed `QuestionParser` incorrectly extracting prompt instructions as quiz titles; resolved LaTeX regex greedily corrupting accounting currency amounts (e.g., `$41,500. Even though she has $58,000`).
3. **Queue & LLM Resilience**: Fixed the permanent deadlock on queue pause/resume; added request timeouts (90s), exponential backoff on 429/5xx, and gated verbose logging.
4. **Desktop Packaging**: Built and bundled a native Bun sidecar backend server (`server/index.ts` compiled via `bun build --compile` into `tauri/server`), automatically spawned and managed by Tauri with an API routing interceptor.

---

## 🛡️ Remediated Vulnerabilities & Architectural Fixes (Phase 1 – 3)

### 1. Tauri Desktop App Missing Backend (Fixed)
- **Problem**: In packaged desktop builds, SvelteKit uses `adapter-static` without an SSR server. Frontend SPA fetches to `/api/*` failed with 404/network errors.
- **Resolution**:
  - Implemented standalone Bun backend server (`server/index.ts`) serving all API routes and static assets with CORS support.
  - Added `bun run server:compile` step creating `tauri/server` standalone native executable bundled into Tauri app resources.
  - Updated `tauri/src/lib.rs` to automatically spawn and manage backend lifecycle, terminating it cleanly on app exit.
  - Implemented `app/src/lib/api.ts` transparent global fetch interceptor routing all `/api/*` requests to the local backend port (`http://127.0.0.1:3182`).

### 2. Shell Command Injection in `open/+server.ts` (Fixed)
- **Problem**: Executed unvalidated user-controlled courseId through shell interpolation `open "${courseDir}"` with `exec()`.
- **Resolution**: Added `assertCourseId()` regex validation and replaced shell `exec()` with `execFile(binary, [courseDir])` (bypassing the shell entirely).

### 3. Path Traversal & Arbitrary File Writes (Fixed)
- **Problem**: Course IDs, lesson IDs, prompt IDs, and asset upload filenames lacked containment verification and ID format allowlists.
- **Resolution**:
  - Created canonical `app/src/lib/server/paths.ts` exporting centralized `getDataDir()`, `getCoursesDir()`, `getPromptsDir()`, `safeJoin()`, and `trySafeJoin()`.
  - Added strict ID format assertions (`assertCourseId`, `assertLessonId`, `assertPromptId`, `assertTab`).
  - Applied path checks across `courses.ts`, `prompts.ts`, and all `/api/*` routes. Filenames in `/api/parse` sanitized with `path.basename`.

### 4. Stored XSS & CSP in `MarkdownViewer.svelte` (Fixed)
- **Problem**: `Marked` rendered un-sanitized HTML via `{@html}`, unescaped image `href` in custom image tags, and Tauri config lacked a Content Security Policy (`csp: null`).
- **Resolution**:
  - Integrated `DOMPurify.sanitize()` with explicit attribute allowlist preserving custom tags (`details`, `summary`, `mark`) and data attributes.
  - Escaped and validated `href` protocols in `renderCustomImage`.
  - Configured strict CSP in `tauri/tauri.conf.json` restricting connect and image sources.

### 5. API Key Stored in Client `localStorage` (Fixed)
- **Problem**: Plaintext LLM API keys stored in browser `localStorage` (`ilc_llm_apiKey`), exposing credentials to client script injection.
- **Resolution**:
  - Server-only persistence in `data/llm_config.json` (gitignored).
  - Client components (`ConfigureLLMModal`, `Settings`, `UploadModal`, `courses/+page.svelte`) purged of `localStorage` API key reads/writes.
  - Masked API key status returned from `GET /api/llm` (`hasApiKey: boolean`).

### 6. Generation Queue Pause/Resume Deadlock (Fixed)
- **Problem**: In `queue.ts`, `processNext()` returned early when paused without resetting `isProcessing = false`. Clicking Resume aborted immediately because `triggerProcessing()` checked `isProcessing == true`.
- **Resolution**:
  - `processNext()` and `finally` now clear `this.isProcessing = false` whenever paused or queue is empty.
  - `resume()` and `cancelAll()` safely reset `isProcessing` flag.

### 7. LLM Provider Timeout & Backoff (Fixed)
- **Problem**: `fetch()` in `llm.ts` lacked timeout and retry logic; stalled providers wedged the queue indefinitely.
- **Resolution**:
  - Added 90s `AbortSignal.timeout` via `AbortController`.
  - Implemented `fetchWithRetry` with exponential backoff on transient errors (HTTP 429, 502, 503, 504, network timeouts).
  - Gated verbose request previews behind `DEBUG_LLM` flag.

### 8. QuestionParser Frontmatter Header Bug (Fixed)
- **Problem**: In practice tests with prompt frontmatter, `parseMarkdown()` read the prompt title at line 3 instead of the quiz title at line 49, resulting in blank course codes and empty titles.
- **Resolution**: Integrated `parseFrontmatter()` to cleanly strip YAML frontmatter before extracting `# Title`, `course:`, and question blocks.

### 9. KaTeX Math vs Accounting Currency Delimiter Conflict (Fixed)
- **Problem**: Global regex `\$([^\$\n]+?)\$` matched across currency amounts (e.g., `net worth is $41,500. Even though she has $58,000 in assets`), rendering prose as italicized KaTeX variables.
- **Resolution**:
  - Refined inline math regex with negative lookaheads (`(?<![\w\\])\$(?!\s|[0-9])([^\$\n]+?)(?<!\s)\$(?!\d)`).
  - Implemented `isLikelyLatex()` validation requiring explicit LaTeX macros (`\frac`, `\sqrt`), structural notation (`^`, `_`, `{}`), or symbolic operators while rejecting natural language phrases and currency amounts.
  - Protected `<code>` and `<pre>` blocks from math parsing.

### 10. Tauri IPC Command Hardening (Fixed)
- **Problem**: `save_pdf_file` and `open_course_folder` accepted unvalidated file paths from webview.
- **Resolution**:
  - `save_pdf_file` enforces file extensions (`.pdf`, `.md`, `.png`) and blocks writes to sensitive system directories.
  - `open_course_folder` enforces alphanumeric `course_id` and verifies directory containment.

---

## 📋 Status of Original 16 Gap Items

| Item | Description | Original Claim | Verified Reality & Status |
|------|-------------|----------------|---------------------------|
| **1** | QuestionParser frontmatter | 🔴 Broken | **Resolved** (YAML frontmatter stripped before parsing) |
| **2** | KaTeX preservation in Turndown | 🔴 Broken | **Pending** (Turndown rules for math export) |
| **3** | `## QuestionsZ` typo in `clu3m/01.02.test.md` | 🔴 Broken | **Fixed** (heading is `## Questions`) |
| **4** | Prompt template placeholders | 🔴 Gaps | **Documented** (templates use active prompts engine) |
| **5** | Tauri fs plugin missing | 🔴 Broken | **Closed as Designed** (uses dedicated IPC `save_pdf_file` / `open_course_folder`) |
| **6** | `sourceUrl` frontmatter field | 🟡 Missing | **Pending** (cosmetic metadata in ingest) |
| **7** | Asset deduplication | 🟡 Filename-only | **Future Enhancement** (content-hash deduplication) |
| **8** | Data storage path in Settings UI | 🟡 Missing | **Architected** (`DATA_DIR` env + `server/paths.ts`) |
| **9** | OpenRouter in provider dropdown | 🟡 Missing | **Supported** (via OpenAI-compatible option) |
| **10** | DocumentViewerModal history pushState | 🟡 Missing | **Pending** (browser history integration) |
| **11** | `bun run parse` CLI script | 🟡 Broken | **Working** (`bun --cwd app parse` tested and passing) |
| **12** | LLM settings localStorage-only | 🟡 Client-only | **Resolved** (server-side `data/llm_config.json`, client sanitized) |
| **13** | Course study resource indicators | 🟢 Missing | **Implemented** (emerald indicator dots & action buttons) |
| **14** | Course cards display `level` field | 🟢 Missing | **Implemented** |
| **15** | Native Gemini API endpoint | 🟢 Missing | **Supported** (via OpenAI compatibility endpoint) |
| **16** | Tauri `bundle.active` flag | 🟢 Disabled | **Enabled** (`bundle.active: true` in `tauri.conf.json`) |

---

## 🚀 Verification & Quality Gates

- `svelte-check`: **0 errors, 0 warnings** across all components.
- `cargo check`: **Clean build (0 errors, 0 warnings)**.
- `bun run check`: **Passes clean**.
- Standalone Bun backend: **Verified responding with 200 OK on `/api/courses`, `/api/llm`, `/api/queue`**.
