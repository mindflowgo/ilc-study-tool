<script lang="ts">
  import { marked } from 'marked';
  import katex from 'katex';

  interface Props {
    markdown: string;
    courseId: string;
  }

  let { markdown, courseId }: Props = $props();

  let renderedHtml = $derived.by(() => {
    if (!markdown) return '';

    // 1. Strip YAML frontmatter
    let cleaned = markdown.replace(/^---[\s\S]*?---\s*/, '');

    // 2. Rewrite image and document paths to point to API route
    cleaned = cleaned.replace(
      /(?:src|href)=["'](?:\.\/)?assets\/(.*?)["']/gi,
      `src="/api/courses/${courseId}/assets/$1"`
    );
    cleaned = cleaned.replace(
      /!\[(.*?)\]\((?:\.\/)?assets\/(.*?)\)/gi,
      `![$1](/api/courses/${courseId}/assets/$2)`
    );
    cleaned = cleaned.replace(
      /\[(.*?)\]\((?:\.\/)?assets\/locker_docs\/(.*?)\)/gi,
      `[$1](/api/courses/${courseId}/assets/locker_docs/$2)`
    );

    // 3. Process GFM Callouts: > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING]
    cleaned = cleaned.replace(
      /> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n((?:>.*(?:\n|$))*)/gi,
      (match, type, content) => {
        const cleanType = type.toLowerCase();
        const body = content.replace(/^>\s?/gm, '');
        return `<div class="callout callout-${cleanType}">\n\n${body}\n\n</div>\n\n`;
      }
    );

    // 4. Render Markdown via marked
    let html = marked.parse(cleaned, { gfm: true, breaks: true }) as string;

    // 5. Render KaTeX formulas if present
    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true });
      } catch {
        return `$$${math}$$`;
      }
    });

    html = html.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false });
      } catch {
        return `$${math}$`;
      }
    });

    return html;
  });
</script>

<div class="markdown-body prose prose-stone max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:border-stone-200 prose-h2:pb-2 prose-h3:text-lg prose-p:leading-relaxed prose-img:rounded-lg prose-img:border prose-img:border-stone-200 prose-img:my-4 prose-table:border prose-table:border-stone-200 prose-th:bg-stone-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2">
  {@html renderedHtml}
</div>
