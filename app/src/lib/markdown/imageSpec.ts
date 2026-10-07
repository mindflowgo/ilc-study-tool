export type DimensionUnit = 'px' | 'rem' | '%';

export interface ImageDimension {
  value: number;
  unit: DimensionUnit;
}

export type NamedImageSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Normalized representation of an Obsidian/markdown image sizing specification.
 */
export interface ParsedImageSpec {
  /** Clean alt text with any `|spec` stripped and trimmed */
  alt: string;
  /** Raw spec text following the last pipe, if any */
  rawSpec: string | null;
  /** Parsed width dimension */
  width: ImageDimension | null;
  /** Parsed height dimension */
  height: ImageDimension | null;
  /** Preset size identifier if matched */
  namedSize: NamedImageSize | null;
  /** Whether a custom sizing spec was present and recognized */
  isCustom: boolean;
}

/**
 * CSS units representation for HTML viewer and editor live preview.
 */
export interface CssImageSpec {
  alt: string;
  width: string | null;
  height: string | null;
  isCustom: boolean;
}

/**
 * PDF point dimensions for pdfmake export.
 */
export interface PdfImageSpec {
  alt: string;
  widthPt: number | null;
  widthPct: number | null;
  heightPt: number | null;
  isCustom: boolean;
}

export interface ToPdfOptions {
  /**
   * Maximum content width in pt. Used to clamp large named sizes
   * (e.g. `lg` / `large`) to fit printable content margins.
   */
  maxContentWidthPt?: number;
}

export const PT_PER_PX = 0.75; // 96dpi CSS px -> 72dpi PDF pt
export const PT_PER_REM = 12; // 16px root font * 0.75 pt/px = 12pt

export const NAMED_IMAGE_SIZES: Record<string, { width: ImageDimension; name: NamedImageSize }> = {
  xs: { width: { value: 160, unit: 'px' }, name: 'xs' },
  thumb: { width: { value: 160, unit: 'px' }, name: 'xs' },
  sm: { width: { value: 280, unit: 'px' }, name: 'sm' },
  small: { width: { value: 280, unit: 'px' }, name: 'sm' },
  md: { width: { value: 480, unit: 'px' }, name: 'md' },
  medium: { width: { value: 480, unit: 'px' }, name: 'md' },
  lg: { width: { value: 720, unit: 'px' }, name: 'lg' },
  large: { width: { value: 720, unit: 'px' }, name: 'lg' },
  xl: { width: { value: 100, unit: '%' }, name: 'xl' },
  full: { width: { value: 100, unit: '%' }, name: 'full' }
};

/**
 * Parses a numeric dimension string with an optional unit (px, rem, %).
 * Unit defaults to 'px' if omitted.
 */
export function parseDimension(str: string): ImageDimension | null {
  const m = str.trim().match(/^(\d+(?:\.\d+)?)(px|rem|%)?$/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return null;
  const unit = (m[2]?.toLowerCase() || 'px') as DimensionUnit;
  return { value, unit };
}

/**
 * Parses an image alt string containing Obsidian-style sizing syntax `![alt|spec](url)`.
 * Returns a normalized AST/spec.
 */
export function parseImageSpec(rawAlt: string): ParsedImageSpec {
  const pipeIndex = rawAlt.lastIndexOf('|');
  if (pipeIndex === -1) {
    return {
      alt: rawAlt.trim(),
      rawSpec: null,
      width: null,
      height: null,
      namedSize: null,
      isCustom: false
    };
  }

  const alt = rawAlt.slice(0, pipeIndex).trim();
  const spec = rawAlt.slice(pipeIndex + 1).trim().toLowerCase();

  if (!spec) {
    return {
      alt,
      rawSpec: '',
      width: null,
      height: null,
      namedSize: null,
      isCustom: false
    };
  }

  // 1. Named presets (xs, thumb, sm, small, md, medium, lg, large, full, xl)
  const named = NAMED_IMAGE_SIZES[spec];
  if (named) {
    return {
      alt,
      rawSpec: spec,
      width: named.width,
      height: null,
      namedSize: named.name,
      isCustom: true
    };
  }

  // 2. Dimension pair: WIDTHxHEIGHT (e.g. 300x200, 50%x300px)
  const dimPairMatch = spec.match(/^(\d+(?:\.\d+)?(?:px|%|rem)?)\s*x\s*(\d+(?:\.\d+)?(?:px|%|rem)?)$/);
  if (dimPairMatch) {
    const width = parseDimension(dimPairMatch[1]);
    const height = parseDimension(dimPairMatch[2]);
    return {
      alt,
      rawSpec: spec,
      width,
      height,
      namedSize: null,
      isCustom: Boolean(width || height)
    };
  }

  // 3. Key-value pairs: width=... / w=..., height=... / h=...
  const wm = spec.match(/\b(?:width|w)=([0-9]+(?:\.\d+)?(?:%|px|rem)?)/i);
  const hm = spec.match(/\b(?:height|h)=([0-9]+(?:\.\d+)?(?:%|px|rem)?)/i);
  let width: ImageDimension | null = null;
  let height: ImageDimension | null = null;

  if (wm) {
    width = parseDimension(wm[1]);
  }
  if (hm) {
    height = parseDimension(hm[1]);
  }

  // 4. Standalone dimension (e.g. 50%, 300, 300px, 20rem)
  if (!width && !height) {
    width = parseDimension(spec);
  }

  const isCustom = Boolean(width || height);
  return {
    alt,
    rawSpec: spec,
    width,
    height,
    namedSize: null,
    isCustom
  };
}

/** Formats an ImageDimension into a CSS string unit. */
export function toCssDimension(dim: ImageDimension | null): string | null {
  if (!dim) return null;
  if (dim.unit === '%') return `${dim.value}%`;
  if (dim.unit === 'rem') return `${dim.value}rem`;
  return `${dim.value}px`;
}

/**
 * Converts a normalized ParsedImageSpec to CSS units (px/rem/%) for HTML viewers & editor widgets.
 */
export function toCssSpec(spec: ParsedImageSpec): CssImageSpec {
  return {
    alt: spec.alt,
    width: toCssDimension(spec.width),
    height: toCssDimension(spec.height),
    isCustom: spec.isCustom
  };
}

/**
 * Parses raw alt text directly into CSS units.
 */
export function parseCssImageSpec(rawAlt: string): CssImageSpec {
  return toCssSpec(parseImageSpec(rawAlt));
}

/**
 * Converts an ImageDimension to PDF points / percentage fraction.
 */
export function toPdfDimension(
  dim: ImageDimension | null
): { pt: number | null; pct: number | null } {
  if (!dim) return { pt: null, pct: null };
  if (dim.unit === '%') {
    return { pt: null, pct: dim.value / 100 };
  }
  if (dim.unit === 'rem') {
    return { pt: dim.value * PT_PER_REM, pct: null };
  }
  return { pt: dim.value * PT_PER_PX, pct: null };
}

/**
 * Converts a normalized ParsedImageSpec to PDF points / fraction for pdfmake.
 */
export function toPdfSpec(
  spec: ParsedImageSpec,
  options?: ToPdfOptions
): PdfImageSpec {
  const widthResult = toPdfDimension(spec.width);
  const heightResult = toPdfDimension(spec.height);

  let widthPt = widthResult.pt;
  const widthPct = widthResult.pct;
  const heightPt = heightResult.pt;

  if (spec.namedSize === 'lg' && options?.maxContentWidthPt != null && widthPt != null) {
    widthPt = Math.min(widthPt, options.maxContentWidthPt);
  }

  return {
    alt: spec.alt,
    widthPt,
    widthPct,
    heightPt,
    isCustom: Boolean(widthPt !== null || widthPct !== null || heightPt !== null)
  };
}

/**
 * Parses raw alt text directly into PDF point dimensions.
 */
export function parsePdfImageSpec(rawAlt: string, options?: ToPdfOptions): PdfImageSpec {
  return toPdfSpec(parseImageSpec(rawAlt), options);
}

/**
 * Decorative icons render as small inline images, distinguishing them from block figures.
 */
export function isIconImage(href: string, alt: string, isCustom: boolean): boolean {
  return (
    href.includes('/assets/icons/') ||
    href.includes('/icons/') ||
    (href.endsWith('.svg') && !isCustom && !href.includes('/img/')) ||
    /\b(icon|badge|button)\b/i.test(alt)
  );
}
