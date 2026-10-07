import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';

export interface LessonFrontmatter {
  title: string;
  activityCode: string;
  courseId: string;
  unit: string;
  unitNumber: number;
  lessonNumber: number;
  type: 'lesson' | 'assignment';
  savedAt: string;
}

export class TurndownConverter {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    });

    this.turndown.use(gfm);

    // Rule for preserving <details> and <summary> tags for collapsible answers
    this.turndown.addRule('detailsElement', {
      filter: ['details', 'summary'],
      replacement: (content, node) => {
        if (node.nodeName === 'SUMMARY') {
          return `<summary>${content.trim()}</summary>\n\n`;
        }
        return `\n\n<details class="suggested-answer">\n${content.trim()}\n</details>\n\n`;
      }
    });

    // Rule for Learning Goals callout
    this.turndown.addRule('learningGoalsCallout', {
      filter: (node) => {
        if (node.nodeName !== 'DIV') return false;
        const className = node.getAttribute('class') || '';
        return className.includes('ilc-callout-goals');
      },
      replacement: (content) => {
        const lines = content
          .trim()
          .split('\n')
          .map((l) => (l.trim() ? `> ${l}` : '>'))
          .join('\n');
        return `\n\n> [!NOTE]\n${lines}\n\n`;
      }
    });

    // Rule for ILC Callouts (Think, Notebook, Portfolio, Try It)
    this.turndown.addRule('ilcCallouts', {
      filter: (node) => {
        if (node.nodeName !== 'DIV') return false;
        const className = node.getAttribute('class') || '';
        return className.includes('ilc-row-callout');
      },
      replacement: (content) => {
        let alertType = 'NOTE';
        if (/think/i.test(content)) alertType = 'TIP';
        if (/try it|try_it/i.test(content)) alertType = 'IMPORTANT';
        if (/warning|caution/i.test(content)) alertType = 'WARNING';

        const lines = content
          .trim()
          .split('\n')
          .filter((l) => l.trim().length > 0)
          .map((l) => `> ${l}`)
          .join('\n');

        return `\n\n> [!${alertType}]\n${lines}\n\n`;
      }
    });
  }

  convertToMarkdown(html: string, frontmatter: LessonFrontmatter): string {
    const mdBody = this.turndown.turndown(html);

    // Clean up excessive blank lines
    const cleanedMd = mdBody.replace(/\n{4,}/g, '\n\n');

    // Create YAML frontmatter
    const yamlHeader = `---\n${(globalThis as any).Bun.YAML.stringify(frontmatter)}---\n\n`;

    return yamlHeader + cleanedMd;
  }
}
