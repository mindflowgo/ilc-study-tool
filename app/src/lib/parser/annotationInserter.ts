/**
 * Utilities for formatting, inserting, and managing > [!USERNOTE] annotations in Markdown.
 */

export interface UserNoteData {
  query: string;
  targetText: string;
  answer: string;
}

/**
 * Formats a user note into standard GFM callout block.
 */
export function formatUserNote(query: string, targetText: string, answer: string): string {
  const cleanQuery = query.trim().replace(/\n+/g, ' ');
  const cleanTarget = targetText.trim().replace(/\r?\n+/g, ' ').replace(/"/g, '\\"');
  
  // Format body with leading blockquote prefix on each line
  const answerLines = answer.trim().split('\n').map((line) => {
    return line.length > 0 ? `> ${line}` : '>';
  }).join('\n');

  return `> [!USERNOTE] ${cleanQuery}\n> <!-- target: "${cleanTarget}" -->\n${answerLines}`;
}

/**
 * Escapes regex special characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inserts a noteBlock into markdown immediately after the paragraph containing selectedText.
 */
export function insertAnnotationAfterText(
  markdown: string,
  selectedText: string,
  noteBlock: string
): { updatedMarkdown: string; success: boolean } {
  if (!markdown || !selectedText) {
    return { updatedMarkdown: markdown, success: false };
  }

  const cleanTarget = selectedText.trim();
  if (!cleanTarget) {
    return { updatedMarkdown: markdown, success: false };
  }

  // 1. Try exact match first
  let matchIndex = markdown.indexOf(cleanTarget);

  // 2. If not found, try flexible whitespace match (markdown might have soft linebreaks)
  let matchedLength = cleanTarget.length;
  if (matchIndex === -1) {
    const tokens = cleanTarget.split(/\s+/).filter(Boolean).map(escapeRegex);
    if (tokens.length > 0) {
      const flexRegex = new RegExp(tokens.join('\\s+'), 'm');
      const m = markdown.match(flexRegex);
      if (m && m.index !== undefined) {
        matchIndex = m.index;
        matchedLength = m[0].length;
      }
    }
  }

  // 3. Fallback: if text still cannot be found (e.g. truncated or sanitized), append at end of file
  if (matchIndex === -1) {
    const updated = `${markdown.trimEnd()}\n\n${noteBlock.trim()}\n`;
    return { updatedMarkdown: updated, success: true };
  }

  // 4. Find the end of the paragraph containing the matched text
  const textAfterMatch = markdown.slice(matchIndex + matchedLength);
  const nextParagraphBreak = textAfterMatch.search(/\n\s*\n/);

  let insertionIndex: number;
  if (nextParagraphBreak !== -1) {
    insertionIndex = matchIndex + matchedLength + nextParagraphBreak;
  } else {
    // End of the document
    insertionIndex = markdown.length;
  }

  const before = markdown.slice(0, insertionIndex).trimEnd();
  const after = markdown.slice(insertionIndex).trimStart();

  const updatedMarkdown = `${before}\n\n${noteBlock.trim()}\n\n${after}`.trimEnd() + '\n';
  return { updatedMarkdown, success: true };
}

/**
 * Removes an annotation block matching the target text or query.
 */
export function removeAnnotation(
  markdown: string,
  targetTextOrQuery: string
): { updatedMarkdown: string; removed: boolean } {
  if (!markdown || !targetTextOrQuery) {
    return { updatedMarkdown: markdown, removed: false };
  }

  const cleanAnchor = escapeRegex(targetTextOrQuery.trim().replace(/^"|"$/g, ''));
  // Regex to match the callout block containing the anchor
  const noteRegex = new RegExp(
    `>\\s*\\[!USERNOTE\\][^\n]*${cleanAnchor}[\\s\\S]*?(?:\\n\\s*\\n|$)`,
    'i'
  );

  let updated = markdown.replace(noteRegex, '\n\n');
  if (updated === markdown) {
    // Also try matching target comment
    const targetCommentRegex = new RegExp(
      `>\\s*\\[!USERNOTE\\][\\s\\S]*?<!--\\s*target:\\s*"[^"]*${cleanAnchor}[^"]*"\\s*-->[\\s\\S]*?(?:\\n\\s*\\n|$)`,
      'i'
    );
    updated = markdown.replace(targetCommentRegex, '\n\n');
  }

  // Clean up any double blank lines
  updated = updated.replace(/\n{3,}/g, '\n\n');
  const removed = updated !== markdown;
  return { updatedMarkdown: updated, removed };
}
