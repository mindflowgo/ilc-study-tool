import type { Tokens, Token } from 'marked';
import type { CompileContext } from '../types';
import { latexToUnicode, splitMathSegments } from './mathText';
import { isIconImage, parseImageSpec } from './imageSpec';

/**
 * A pdfmake text array entry: a plain string or a styled text object.
 */
export type InlineSpan = string | Record<string, unknown>;

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
};

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

function stripInlineHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

/** Renders inline math segments of a plain string into Unicode text spans. */
function textWithMath(text: string): InlineSpan[] {
  return splitMathSegments(text).map((seg) =>
    seg.kind === 'math' ? latexToUnicode(seg.value) : seg.value
  );
}

/**
 * Walks marked inline tokens into a pdfmake-compatible text array.
 */
export function inlineTokensToSpans(
  tokens: Token[] | undefined,
  ctx: CompileContext
): InlineSpan[] {
  const spans: InlineSpan[] = [];

  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'text': {
        const textToken = token as Tokens.Text;
        if (textToken.tokens && textToken.tokens.length > 0) {
          spans.push(...inlineTokensToSpans(textToken.tokens, ctx));
        } else {
          spans.push(...textWithMath(textToken.text));
        }
        break;
      }
      case 'escape': {
        spans.push((token as Tokens.Escape).text);
        break;
      }
      case 'strong': {
        spans.push({ text: inlineTokensToSpans((token as Tokens.Strong).tokens, ctx), bold: true });
        break;
      }
      case 'em': {
        spans.push({ text: inlineTokensToSpans((token as Tokens.Em).tokens, ctx), italics: true });
        break;
      }
      case 'del': {
        spans.push({
          text: inlineTokensToSpans((token as Tokens.Del).tokens, ctx),
          decoration: 'lineThrough',
          color: '#78716c'
        });
        break;
      }
      case 'codespan': {
        spans.push({ text: (token as Tokens.Codespan).text, style: 'codeInline' });
        break;
      }
      case 'link': {
        const link = token as Tokens.Link;
        const inner =
          link.tokens && link.tokens.length > 0
            ? inlineTokensToSpans(link.tokens, ctx)
            : link.text;
        spans.push({ text: inner, link: link.href, style: 'link' });
        break;
      }
      case 'image': {
        const image = token as Tokens.Image;
        const spec = parseImageSpec(image.text || '');
        const icon = isIconImage(image.href, spec.alt, spec.isCustom);
        spans.push(ctx.embedImage(image.href, spec, icon ? 'inline' : 'block') as InlineSpan);
        break;
      }
      case 'br': {
        spans.push('\n');
        break;
      }
      case 'html': {
        const stripped = stripInlineHtml((token as Tokens.HTML).text);
        if (stripped) spans.push(...textWithMath(stripped));
        break;
      }
      default: {
        const fallback = (token as { text?: string }).text;
        if (fallback) spans.push(...textWithMath(fallback));
        break;
      }
    }
  }

  return spans;
}
