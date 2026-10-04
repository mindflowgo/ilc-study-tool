import { Facet } from "@codemirror/state";

/**
 * Course ID of the lesson being edited, used to resolve relative asset & image paths.
 */
export const courseIdFacet = Facet.define<string, string>({
  combine: (values) => (values.length ? values[values.length - 1] : ""),
});

/** URL schemes we are willing to hand to an `<a>` or `<img>` element. */
const WEB_URL = /^https?:\/\//i;
const DATA_IMAGE = /^data:image\/[a-z0-9.+-]+;/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The `href` to open for a link. Anything with an unsafe scheme (e.g. javascript:)
 * is dropped.
 */
export function safeExternalHref(url: string): string | null {
  const trimmed = url.trim();
  if (WEB_URL.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return trimmed;
  return null;
}

/**
 * Resolves an image source for live preview inside the editor:
 * Web URLs and data URLs pass through directly.
 * Relative course asset paths (`./assets/...` or `assets/...`) resolve to the API route.
 */
export function resolveImageSource(url: string, courseId: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (WEB_URL.test(trimmed) || DATA_IMAGE.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/api/")) return trimmed;
  if (HAS_SCHEME.test(trimmed)) return null;

  let clean = trimmed.replace(/^\.\//, "");
  if (clean.startsWith("assets/")) {
    clean = clean.slice("assets/".length);
  }

  if (courseId) {
    return `/api/courses/${courseId}/assets/${clean}`;
  }

  return clean.startsWith("/") ? clean : `/assets/${clean}`;
}

export interface EditorImageSpec {
  alt: string;
  width: string | null;
  height: string | null;
}

export function parseEditorImageSpec(rawText: string): EditorImageSpec {
  const pipeIndex = rawText.lastIndexOf("|");
  if (pipeIndex === -1) {
    return { alt: rawText.trim(), width: null, height: null };
  }

  const alt = rawText.slice(0, pipeIndex).trim();
  const spec = rawText.slice(pipeIndex + 1).trim().toLowerCase();

  let width: string | null = null;
  let height: string | null = null;

  if (spec === "xs" || spec === "thumb") width = "160px";
  else if (spec === "sm" || spec === "small") width = "280px";
  else if (spec === "md" || spec === "medium") width = "480px";
  else if (spec === "lg" || spec === "large") width = "720px";
  else if (spec === "full" || spec === "xl") width = "100%";
  else if (/^(\d+(?:px|%|rem)?)\s*x\s*(\d+(?:px|%|rem)?)$/.test(spec)) {
    const m = spec.match(/^(\d+(?:px|%|rem)?)\s*x\s*(\d+(?:px|%|rem)?)$/);
    if (m) {
      width = m[1].endsWith("%") || m[1].endsWith("px") || m[1].endsWith("rem") ? m[1] : m[1] + "px";
      height = m[2].endsWith("%") || m[2].endsWith("px") || m[2].endsWith("rem") ? m[2] : m[2] + "px";
    }
  } else {
    const wm = spec.match(/\b(?:width|w)=([0-9]+(?:%|px|rem)?)/i);
    const hm = spec.match(/\b(?:height|h)=([0-9]+(?:%|px|rem)?)/i);
    if (wm) {
      width = wm[1].endsWith("%") || wm[1].endsWith("px") || wm[1].endsWith("rem") ? wm[1] : wm[1] + "px";
    }
    if (hm) {
      height = hm[1].endsWith("%") || hm[1].endsWith("px") || hm[1].endsWith("rem") ? hm[1] : hm[1] + "px";
    }
    if (!width && !height) {
      if (/^\d+(?:%|px|rem)$/.test(spec)) {
        width = spec;
      } else if (/^\d+$/.test(spec)) {
        width = spec + "px";
      }
    }
  }

  return { alt, width, height };
}
