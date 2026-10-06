import type { Content } from 'pdfmake/build/pdfmake';
import type { CompileContext } from '../types';
import { CALLOUTS, COLORS } from '../theme';
import { box } from '../box';
import { compileMarkdownContent } from './blocks';

const DETAILS_RE = /<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Handles raw-HTML block tokens: `<details>` suggested answers, callout divs
 * that escaped preprocessing, embedded iframes, and generic markup which is
 * reduced to its text content.
 */
export function htmlBlockToContent(html: string, ctx: CompileContext): Content[] {
  const out: Content[] = [];

  // <details><summary>...</summary> body </details> — always unfolded in print
  let rest = html;
  let m: RegExpExecArray | null;
  while ((m = DETAILS_RE.exec(rest)) !== null) {
    const before = rest.slice(0, m.index);
    if (before.trim()) out.push(...plainHtmlFallback(before, ctx));
    const summary = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim();
    const body = m[2].trim();
    out.push(
      box(
        [
          { text: summary || 'Suggested Answer', bold: true, fontSize: 9.5, color: COLORS.muted, margin: [0, 0, 0, 4] },
          ...compileMarkdownContent(body, ctx)
        ],
        { fill: COLORS.softFill, borderColor: COLORS.border }
      )
    );
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest.trim()) out.push(...plainHtmlFallback(rest, ctx));

  return out;
}

function plainHtmlFallback(html: string, ctx: CompileContext): Content[] {
  // Embedded interactive content the PDF cannot reproduce
  const embed = html.match(/<(iframe|object|embed)[^>]*(?:src|data)=["']([^"']+)["'][^>]*>/i);
  if (embed) {
    return [
      box(
        {
          text: [
            { text: 'Embedded content: ', bold: true },
            { text: embed[2], link: embed[2], style: 'link' }
          ],
          fontSize: 9.5,
          color: COLORS.muted
        },
        { fill: COLORS.softFill, borderColor: COLORS.border }
      )
    ];
  }

  // Callout divs authored directly as HTML
  const calloutDiv = html.match(/<div[^>]*class=["'][^"']*callout(?:-([a-z]+))?[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (calloutDiv) {
    const type = (calloutDiv[1] || 'note').toLowerCase();
    const theme = CALLOUTS[type] ?? CALLOUTS.note;
    return [calloutBox(theme.label, theme, calloutDiv[2].trim(), ctx)];
  }

  const text = decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).trim();

  if (text) {
    return [{ text, style: 'body' } as Content];
  }
  return [];
}

/** Builds the styled callout card used for both markers and raw HTML callouts. */
export function calloutBox(
  label: string,
  theme: { border: string; fill: string; text: string },
  bodyMarkdown: string,
  ctx: CompileContext
): Content {
  return box(
    [
      { text: label.toUpperCase(), bold: true, fontSize: 8.5, color: theme.border, characterSpacing: 0.8, margin: [0, 0, 0, 4] },
      ...compileMarkdownContent(bodyMarkdown, ctx)
    ],
    { fill: theme.fill, borderColor: theme.border }
  );
}
