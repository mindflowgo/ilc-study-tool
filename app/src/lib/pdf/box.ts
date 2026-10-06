import type { Content } from 'pdfmake/build/pdfmake';
import { COLORS } from './theme';

export interface BoxOptions {
  fill?: string;
  borderColor?: string;
  borderWidth?: number;
  /** Cell padding: single number or [top, right, bottom, left]. */
  padding?: number | [number, number, number, number];
  margin?: [number, number, number, number];
}

/**
 * Wraps content in a filled single-cell table — the pdfmake equivalent of a
 * callout card / code panel / quiz question card.
 */
export function box(content: Content | Content[], options: BoxOptions = {}): Content {
  const width = options.borderWidth ?? 0.75;
  const color = options.borderColor ?? COLORS.border;
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: Array.isArray(content) ? content : [content],
            fillColor: options.fill,
            margin: options.padding ?? [10, 8, 10, 8]
          }
        ]
      ]    },
    layout: {
      tableStyle: 'plain',
      hLineColor: () => color,
      vLineColor: () => color,
      hLineWidth: () => width,
      vLineWidth: () => width,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0
    },
    margin: options.margin ?? [0, 0, 0, 10]
  } as Content;
}

/** Light hairline table layout used for markdown data tables and answer-key grids. */
export function dataTableLayout() {
  return {
    hLineColor: (i: number, node: { table: { body: unknown[][] } }) =>
      i === 0 || i === (node.table?.body?.length ?? 0) ? COLORS.borderDark : COLORS.border,
    vLineColor: () => COLORS.border,
    hLineWidth: (i: number, node: { table: { body: unknown[][] } }) =>
      i === 0 || i === (node.table?.body?.length ?? 0) ? 0.75 : 0.5,
    vLineWidth: () => 0.5,
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 4,
    paddingBottom: () => 4
  };
}

/** Full-width horizontal rule. */
export function dividerLine(contentWidth: number): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: contentWidth,
        y2: 0,
        lineWidth: 0.75,
        lineColor: COLORS.borderDark
      }
    ],
    margin: [0, 6, 0, 12]
  } as Content;
}
