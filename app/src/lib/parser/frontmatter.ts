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

// Bun.YAML is a runtime builtin — keeps the compiled sidecar binary free of
// a separate YAML dependency. Structural typing avoids requiring @types/bun
// in the app package.
interface BunYaml {
  parse(source: string): unknown;
  stringify(value: unknown): string;
}

function getYaml(): BunYaml {
  const yaml = (globalThis as { Bun?: { YAML?: BunYaml } }).Bun?.YAML;
  if (!yaml) {
    throw new Error('Bun.YAML is unavailable (requires Bun >= 1.3.15)');
  }
  return yaml;
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
      const data = (getYaml().parse(match[1]) as FrontmatterData) || {};
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
  const yamlStr = getYaml().stringify(frontmatter);
  return `---\n${yamlStr}---\n\n${body.trim()}\n`;
}
