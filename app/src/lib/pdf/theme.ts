import type { StyleDictionary } from 'pdfmake/interfaces';

/**
 * Shared geometry + visual language for all PDF exports.
 * Sizes are in PDF points (1pt = 1/72in). A4 portrait: 595.28 x 841.89pt.
 */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  margins: [40, 44, 40, 56] as [number, number, number, number]
};

/** Printable width between the left/right margins. */
export const CONTENT_WIDTH = PAGE.width - PAGE.margins[0] - PAGE.margins[2];

/** Tallest a single image may be on a page (leaves room for captions). */
export const MAX_IMAGE_HEIGHT = 620;

export const FONT = {
  sans: 'DejaVu',
  mono: 'DejaVuMono'
};

export const COLORS = {
  ink: '#1c1917',
  heading: '#0c0a09',
  muted: '#57534e',
  faint: '#a8a29e',
  border: '#e7e5e4',
  borderDark: '#d6d3d1',
  softFill: '#fafaf9',
  headerFill: '#f5f5f4',
  accent: '#d97706',
  link: '#1d4ed8',
  code: '#334155',
  answerGreen: '#047857',
  answerFill: '#ecfdf5',
  white: '#ffffff'
} as const;

export interface CalloutTheme {
  border: string;
  fill: string;
  text: string;
  label: string;
}

export const CALLOUTS: Record<string, CalloutTheme> = {
  note: { border: '#3b82f6', fill: '#eff6ff', text: '#1e3a8a', label: 'Note' },
  tip: { border: '#10b981', fill: '#ecfdf5', text: '#064e3b', label: 'Tip' },
  important: { border: '#8b5cf6', fill: '#f5f3ff', text: '#4c1d95', label: 'Important' },
  warning: { border: '#f59e0b', fill: '#fffbeb', text: '#78350f', label: 'Warning' },
  caution: { border: '#ef4444', fill: '#fef2f2', text: '#991b1b', label: 'Caution' }
};

export const POSTIT = {
  border: '#fcd34d',
  fill: '#fefce8',
  title: '#78350f',
  text: '#451a03',
  accent: '#b45309'
} as const;

/** Named pdfmake styles referenced by the compilers. */
export const STYLES: StyleDictionary = {
  body: {
    font: FONT.sans,
    fontSize: 10.5,
    lineHeight: 1.4,
    color: COLORS.ink,
    margin: [0, 0, 0, 8]
  },
  h1: {
    font: FONT.sans,
    fontSize: 17,
    bold: true,
    color: COLORS.heading,
    margin: [0, 18, 0, 8],
    lineHeight: 1.2
  },
  h2: {
    font: FONT.sans,
    fontSize: 14,
    bold: true,
    color: COLORS.heading,
    margin: [0, 16, 0, 7],
    lineHeight: 1.2
  },
  h3: {
    font: FONT.sans,
    fontSize: 12,
    bold: true,
    color: COLORS.heading,
    margin: [0, 13, 0, 5],
    lineHeight: 1.2
  },
  h4: {
    font: FONT.sans,
    fontSize: 10.8,
    bold: true,
    color: COLORS.heading,
    margin: [0, 11, 0, 4],
    lineHeight: 1.2
  },
  codeInline: {
    font: FONT.mono,
    fontSize: 9.2,
    color: COLORS.code
  },
  codeBlock: {
    font: FONT.mono,
    fontSize: 8.4,
    color: COLORS.code,
    lineHeight: 1.25,
    preserveLeadingSpaces: true
  },
  blockquote: {
    font: FONT.sans,
    fontSize: 10.2,
    italics: true,
    color: COLORS.muted,
    lineHeight: 1.4
  },
  caption: {
    font: FONT.sans,
    fontSize: 8.5,
    italics: true,
    color: COLORS.faint,
    margin: [0, 3, 0, 10]
  },
  link: {
    color: COLORS.link,
    decoration: 'underline',
    fontSize: 10.2
  },
  listItem: {
    margin: [0, 0, 0, 3]
  },
  meta: {
    font: FONT.sans,
    fontSize: 8,
    color: COLORS.muted
  },
  quizQNum: {
    font: FONT.mono,
    fontSize: 9,
    bold: true,
    color: COLORS.muted
  },
  quizCategory: {
    font: FONT.sans,
    fontSize: 7.5,
    color: COLORS.muted
  },
  quizPrompt: {
    font: FONT.sans,
    fontSize: 10.5,
    bold: true,
    color: COLORS.ink,
    lineHeight: 1.35
  },
  quizOption: {
    font: FONT.sans,
    fontSize: 10,
    color: COLORS.ink,
    lineHeight: 1.3
  }
};
