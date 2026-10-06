import { CONTENT_WIDTH } from '../theme';
import type { ImageSpec } from '../types';

const PT_PER_PX = 0.75; // 96dpi CSS px -> 72dpi PDF pt
const PT_PER_REM = 12; // 16px root

function cssToPt(value: string): number | null {
  const m = value.match(/^(\d+(?:\.\d+)?)(px|rem|%)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (m[2] === '%') return null;
  if (m[2] === 'rem') return n * PT_PER_REM;
  return n * PT_PER_PX;
}

/**
 * Parses the app's custom image sizing syntax `![alt|spec](url)`,
 * mirroring MarkdownViewer.parseImageSpec but producing PDF points.
 */
export function parseImageSpec(rawAlt: string): ImageSpec {
  const pipeIndex = rawAlt.lastIndexOf('|');
  if (pipeIndex === -1) {
    return { alt: rawAlt.trim(), widthPt: null, widthPct: null, heightPt: null, isCustom: false };
  }

  const alt = rawAlt.slice(0, pipeIndex).trim();
  const spec = rawAlt.slice(pipeIndex + 1).trim().toLowerCase();

  let widthPt: number | null = null;
  let widthPct: number | null = null;
  let heightPt: number | null = null;

  if (spec === 'xs' || spec === 'thumb') widthPt = 160 * PT_PER_PX;
  else if (spec === 'sm' || spec === 'small') widthPt = 280 * PT_PER_PX;
  else if (spec === 'md' || spec === 'medium') widthPt = 480 * PT_PER_PX;
  else if (spec === 'lg' || spec === 'large') widthPt = Math.min(720 * PT_PER_PX, CONTENT_WIDTH);
  else if (spec === 'full' || spec === 'xl') widthPct = 1;
  else if (/^(\d+(?:px|%|rem)?)\s*x\s*(\d+(?:px|%|rem)?)$/.test(spec)) {
    const m = spec.match(/^(\d+(?:px|%|rem)?)\s*x\s*(\d+(?:px|%|rem)?)$/)!;
    if (m[1].endsWith('%')) widthPct = parseFloat(m[1]) / 100;
    else widthPt = cssToPt(m[1]) ?? null;
    if (!m[2].endsWith('%')) heightPt = cssToPt(m[2]) ?? null;
  } else {
    const wm = spec.match(/\b(?:width|w)=(\d+(?:\.\d+)?(?:%|px|rem)?)/i);
    const hm = spec.match(/\b(?:height|h)=(\d+(?:\.\d+)?(?:%|px|rem)?)/i);
    if (wm) {
      if (wm[1].endsWith('%')) widthPct = parseFloat(wm[1]) / 100;
      else widthPt = cssToPt(wm[1]) ?? parseFloat(wm[1]) * PT_PER_PX;
    }
    if (hm && !hm[1].endsWith('%')) {
      heightPt = cssToPt(hm[1]) ?? parseFloat(hm[1]) * PT_PER_PX;
    }
    if (!widthPt && !widthPct && !heightPt) {
      if (/^\d+(?:\.\d+)?%$/.test(spec)) widthPct = parseFloat(spec) / 100;
      else if (/^\d+(?:\.\d+)?$/.test(spec)) widthPt = parseFloat(spec) * PT_PER_PX;
    }
  }

  return { alt, widthPt, widthPct, heightPt, isCustom: Boolean(widthPt || widthPct || heightPt) };
}

/** Decorative icons render as small inline images, like the viewer's icon handling. */
export function isIconImage(href: string, alt: string, isCustom: boolean): boolean {
  return (
    href.includes('/assets/icons/') ||
    href.includes('/icons/') ||
    (href.endsWith('.svg') && !isCustom && !href.includes('/img/')) ||
    /\b(icon|badge|button)\b/i.test(alt)
  );
}
