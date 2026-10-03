import fs from 'node:fs';
import path from 'node:path';

function getPromptsDir(): string {
  const candidate1 = path.resolve(process.cwd(), 'data', 'prompts');
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), '..', 'data', 'prompts');
  if (fs.existsSync(candidate2)) return candidate2;

  return candidate1;
}

export interface PromptItem {
  id: string; // e.g. "summary", "cheatsheet", "test_kica"
  title: string;
  filename: string;
  content: string;
}

export class PromptService {
  static listPrompts(): PromptItem[] {
    const dir = getPromptsDir();
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    const prompts: PromptItem[] = [];

    for (const f of files) {
      const id = f.replace(/\.md$/, '');
      const fullPath = path.join(dir, f);
      const content = fs.readFileSync(fullPath, 'utf8');
      const titleMatch = content.match(/^#\s+(.*)/m);
      const title = titleMatch ? titleMatch[1].trim() : id;

      prompts.push({
        id,
        title,
        filename: f,
        content
      });
    }

    return prompts;
  }

  static getPrompt(id: string): PromptItem | null {
    const dir = getPromptsDir();
    const fullPath = path.join(dir, `${id}.md`);
    if (!fs.existsSync(fullPath)) return null;

    const content = fs.readFileSync(fullPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.*)/m);
    return {
      id,
      title: titleMatch ? titleMatch[1].trim() : id,
      filename: `${id}.md`,
      content
    };
  }

  static savePrompt(id: string, content: string): boolean {
    const dir = getPromptsDir();
    fs.mkdirSync(dir, { recursive: true });
    const fullPath = path.join(dir, `${id}.md`);

    try {
      fs.writeFileSync(fullPath, content, 'utf8');
      return true;
    } catch {
      return false;
    }
  }
}
