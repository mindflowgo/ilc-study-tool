import yaml from 'js-yaml';

export interface FrontmatterData {
  prompt?: string;
  type?: string;
  version?: number | string;
  updatedAt?: string;
  title?: string;
  [key: string]: any;
}

export interface ParsedMarkdownFile {
  frontmatter: FrontmatterData;
  body: string;
}

/**
 * Parses YAML frontmatter (---\n...\n---) from markdown content.
 */
export function parseFrontmatter(fileContent: string, defaultPrompt: string = ''): ParsedMarkdownFile {
  if (!fileContent) {
    return { frontmatter: { prompt: defaultPrompt }, body: '' };
  }

  const match = fileContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n*([\s\S]*)$/);
  if (match) {
    try {
      const data = (yaml.load(match[1]) as FrontmatterData) || {};
      if (!data.prompt && defaultPrompt) {
        data.prompt = defaultPrompt;
      }
      return {
        frontmatter: data,
        body: match[2].trim()
      };
    } catch (e) {
      console.warn('Failed to parse YAML frontmatter:', e);
    }
  }

  // If no frontmatter block exists, return default prompt and full body
  return {
    frontmatter: { prompt: defaultPrompt },
    body: fileContent.trim()
  };
}

/**
 * Serializes frontmatter object and body into standard YAML frontmatter markdown.
 */
export function serializeWithFrontmatter(frontmatter: FrontmatterData, body: string): string {
  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
  return `---\n${yamlStr}---\n\n${body.trim()}\n`;
}
