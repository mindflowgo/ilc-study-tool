import fs from 'node:fs';
import path from 'node:path';

/**
 * Single source of truth for every server-side filesystem path.
 *
 * Two rules the rest of the server layer depends on:
 *   1. Data locations are resolved here and nowhere else, so `DATA_DIR`
 *      applies uniformly to courses, prompts and the LLM config.
 *   2. Any path built from a request-supplied identifier goes through
 *      `safeJoin()`, which proves the result stays inside the data
 *      directory instead of merely stripping `../` sequences.
 */

/** Raised when a request-supplied identifier or path escapes its allowed shape. */
export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathValidationError';
  }
}

/**
 * Identifiers we accept: start with an alphanumeric, then alphanumerics,
 * dot, underscore or dash. This covers real lesson ids (`01.01`,
 * `01.06_assign1`), course ids (`baf3m`) and prompt ids (`course_summary`),
 * while excluding separators, traversal and shell metacharacters.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function assertId(kind: string, value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value) || value === '.' || value === '..') {
    throw new PathValidationError(
      `Invalid ${kind}: ${JSON.stringify(typeof value === 'string' ? value : typeof value)}`
    );
  }
  return value;
}

export const assertCourseId = (value: unknown): string => assertId('course id', value);
export const assertLessonId = (value: unknown): string => assertId('lesson id', value);
export const assertPromptId = (value: unknown): string => assertId('prompt id', value);

/** Study tabs, optionally carrying a multi-version suffix (`summary-2`). */
const TAB_PATTERN = /^(lesson|summary|cheatsheet|test)(-\d+)?$/i;

export function assertTab(value: unknown): string {
  if (typeof value !== 'string' || !TAB_PATTERN.test(value)) {
    throw new PathValidationError(`Invalid tab: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Resolves the root data directory, honouring `DATA_DIR` when it is set and
 * exists. Falls back to `./data` or `../data` so `bun run dev` works from
 * either the repo root or the `app/` directory.
 */
export function getDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
    console.warn(`[paths] DATA_DIR="${fromEnv}" does not exist; falling back to the default location.`);
  }

  const cwdData = path.resolve(process.cwd(), 'data');
  if (fs.existsSync(cwdData)) return cwdData;

  const parentData = path.resolve(process.cwd(), '..', 'data');
  if (fs.existsSync(parentData)) return parentData;

  return cwdData;
}

export function getCoursesDir(): string {
  return path.join(getDataDir(), 'courses');
}

export function getPromptsDir(): string {
  return path.join(getDataDir(), 'prompts');
}

export function getLlmConfigPath(): string {
  return path.join(getDataDir(), 'llm_config.json');
}

/**
 * Joins `segments` onto `baseDir` and guarantees the result stays inside it.
 *
 * `path.normalize` alone is not enough: stripping leading `../` misses
 * traversal that reappears mid-path, and `path.join` happily discards an
 * earlier segment when a later one is absolute. Resolving and then comparing
 * against the base is the check that actually holds.
 */
export function safeJoin(baseDir: string, ...segments: string[]): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...segments);
  const relative = path.relative(base, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PathValidationError(`Path escapes its base directory: ${segments.join('/')}`);
  }

  return target;
}

/**
 * Safe variant for read-only lookups that should simply miss rather than
 * fail the request (asset probing, document existence checks).
 */
export function trySafeJoin(baseDir: string, ...segments: string[]): string | null {
  try {
    return safeJoin(baseDir, ...segments);
  } catch {
    return null;
  }
}

/** Normalises a course id the way the service layer stores it. */
export function normalizeCourseId(value: unknown): string {
  return assertCourseId(value).toLowerCase();
}