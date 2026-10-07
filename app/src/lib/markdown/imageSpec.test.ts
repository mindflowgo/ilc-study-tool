import { describe, it, expect } from 'bun:test';
import {
  parseImageSpec,
  parseCssImageSpec,
  parsePdfImageSpec,
  toCssSpec,
  toPdfSpec,
  isIconImage,
  PT_PER_PX,
  PT_PER_REM
} from './imageSpec';

describe('imageSpec unified parser', () => {
  it('parses plain alt text with no sizing spec', () => {
    const spec = parseImageSpec('A simple illustration');
    expect(spec).toEqual({
      alt: 'A simple illustration',
      rawSpec: null,
      width: null,
      height: null,
      namedSize: null,
      isCustom: false
    });

    const css = toCssSpec(spec);
    expect(css).toEqual({
      alt: 'A simple illustration',
      width: null,
      height: null,
      isCustom: false
    });

    const pdf = toPdfSpec(spec);
    expect(pdf).toEqual({
      alt: 'A simple illustration',
      widthPt: null,
      widthPct: null,
      heightPt: null,
      isCustom: false
    });
  });

  it('handles empty spec after pipe gracefully', () => {
    const spec = parseImageSpec('Image alt|');
    expect(spec.alt).toBe('Image alt');
    expect(spec.isCustom).toBe(false);
    expect(spec.width).toBeNull();
  });

  it('parses named size presets', () => {
    const cases = [
      { specStr: 'Diagram|xs', expectedCssW: '160px', expectedPt: 160 * PT_PER_PX, expectedPct: null },
      { specStr: 'Diagram|thumb', expectedCssW: '160px', expectedPt: 160 * PT_PER_PX, expectedPct: null },
      { specStr: 'Diagram|sm', expectedCssW: '280px', expectedPt: 280 * PT_PER_PX, expectedPct: null },
      { specStr: 'Diagram|small', expectedCssW: '280px', expectedPt: 280 * PT_PER_PX, expectedPct: null },
      { specStr: 'Diagram|md', expectedCssW: '480px', expectedPt: 480 * PT_PER_PX, expectedPct: null },
      { specStr: 'Diagram|medium', expectedCssW: '480px', expectedPt: 480 * PT_PER_PX, expectedPct: null },
      { specStr: 'Diagram|lg', expectedCssW: '720px', expectedPt: 720 * PT_PER_PX, expectedPct: null },
      { specStr: 'Diagram|large', expectedCssW: '720px', expectedPt: 720 * PT_PER_PX, expectedPct: null },
      { specStr: 'Diagram|full', expectedCssW: '100%', expectedPt: null, expectedPct: 1 },
      { specStr: 'Diagram|xl', expectedCssW: '100%', expectedPt: null, expectedPct: 1 }
    ];

    for (const c of cases) {
      const parsed = parseImageSpec(c.specStr);
      expect(parsed.alt).toBe('Diagram');
      expect(parsed.isCustom).toBe(true);

      const css = toCssSpec(parsed);
      expect(css.width).toBe(c.expectedCssW);
      expect(css.height).toBeNull();

      const pdf = toPdfSpec(parsed);
      expect(pdf.widthPt).toBe(c.expectedPt);
      expect(pdf.widthPct).toBe(c.expectedPct);
    }
  });

  it('clamps large named preset (lg) when maxContentWidthPt is provided', () => {
    const parsed = parseImageSpec('Diagram|lg');
    const contentWidth = 515.28;
    const pdf = toPdfSpec(parsed, { maxContentWidthPt: contentWidth });
    expect(pdf.widthPt).toBe(contentWidth);
  });

  it('parses WIDTHxHEIGHT dimension pairs', () => {
    const parsed = parseImageSpec('Chart|300x200');
    expect(parsed.alt).toBe('Chart');
    expect(parsed.width).toEqual({ value: 300, unit: 'px' });
    expect(parsed.height).toEqual({ value: 200, unit: 'px' });

    const css = toCssSpec(parsed);
    expect(css.width).toBe('300px');
    expect(css.height).toBe('200px');

    const pdf = toPdfSpec(parsed);
    expect(pdf.widthPt).toBe(300 * PT_PER_PX);
    expect(pdf.heightPt).toBe(200 * PT_PER_PX);
    expect(pdf.widthPct).toBeNull();
  });

  it('parses mixed unit dimensions like 50%x300px and rem units', () => {
    const parsed = parseImageSpec('Banner|50%x300px');
    const css = toCssSpec(parsed);
    expect(css.width).toBe('50%');
    expect(css.height).toBe('300px');

    const pdf = toPdfSpec(parsed);
    expect(pdf.widthPct).toBe(0.5);
    expect(pdf.heightPt).toBe(300 * PT_PER_PX);

    const remParsed = parseImageSpec('Icon|10remx5rem');
    const remCss = toCssSpec(remParsed);
    expect(remCss.width).toBe('10rem');
    expect(remCss.height).toBe('5rem');

    const remPdf = toPdfSpec(remParsed);
    expect(remPdf.widthPt).toBe(10 * PT_PER_REM);
    expect(remPdf.heightPt).toBe(5 * PT_PER_REM);
  });

  it('parses key-value dimensions (w=..., height=...)', () => {
    const parsed = parseImageSpec('Graph|width=50% height=150');
    const css = toCssSpec(parsed);
    expect(css.width).toBe('50%');
    expect(css.height).toBe('150px');

    const pdf = toPdfSpec(parsed);
    expect(pdf.widthPct).toBe(0.5);
    expect(pdf.heightPt).toBe(150 * PT_PER_PX);

    const shorthand = parseImageSpec('Graph|w=400 h=200px');
    const shorthandCss = toCssSpec(shorthand);
    expect(shorthandCss.width).toBe('400px');
    expect(shorthandCss.height).toBe('200px');
  });

  it('parses standalone percentage and numeric widths', () => {
    const pct = parseCssImageSpec('Illustration|50%');
    expect(pct.width).toBe('50%');
    expect(pct.height).toBeNull();
    expect(pct.isCustom).toBe(true);

    const num = parseCssImageSpec('Illustration|450');
    expect(num.width).toBe('450px');
    expect(num.height).toBeNull();
    expect(num.isCustom).toBe(true);

    const pdfPct = parsePdfImageSpec('Illustration|50%');
    expect(pdfPct.widthPct).toBe(0.5);
    expect(pdfPct.widthPt).toBeNull();

    const pdfNum = parsePdfImageSpec('Illustration|400');
    expect(pdfNum.widthPt).toBe(400 * PT_PER_PX);
  });

  it('identifies decorative icons correctly via isIconImage', () => {
    expect(isIconImage('/assets/icons/arrow.svg', 'arrow', false)).toBe(true);
    expect(isIconImage('/icons/folder.png', 'folder', false)).toBe(true);
    expect(isIconImage('/content/symbol.svg', 'symbol', false)).toBe(true);
    expect(isIconImage('/content/img/diagram.svg', 'symbol', false)).toBe(false);
    expect(isIconImage('/assets/img/badge.png', 'Unit 1 badge', false)).toBe(true);
    expect(isIconImage('/assets/img/button.png', 'Click button', false)).toBe(true);
    expect(isIconImage('/assets/img/photo.png', 'A family photo', false)).toBe(false);
  });
});
