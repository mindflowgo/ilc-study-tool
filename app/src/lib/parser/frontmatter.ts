import { load, dump } from 'js-yaml';

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

// Bun.YAML is the preferred runtime builtin when running on Bun (sidecar, server, CLI).
// When running in a browser / Tauri WebView environment where Bun is unavailable,
// it falls back cleanly to js-yaml.
interface YamlEngine {
  parse(source: string): unknown;
  stringify(value: unknown): string;
}

function getYaml(): YamlEngine {
  const bunYaml = (typeof Bun !== 'undefined' ? Bun.YAML : undefined)
    ?? (globalThis as { Bun?: { YAML?: YamlEngine } }).Bun?.YAML;
  if (bunYaml) {
    return bunYaml;
  }
  return {
    parse(source: string): unknown {
      return load(source);
    },
    stringify(value: unknown): string {
      return dump(value, { lineWidth: -1 });
    }
  };
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
  // Bun.YAML.stringify emits no trailing newline; the closing --- must
  // start its own line or parseFrontmatter cannot find the block.
  const yamlStr = getYaml().stringify(frontmatter).replace(/\n?$/, '\n');
  return `---\n${yamlStr}---\n\n${body.trim()}\n`;
}
