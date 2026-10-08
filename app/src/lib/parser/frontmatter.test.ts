import { describe, it, expect } from 'bun:test';
import { parseFrontmatter, serializeWithFrontmatter, type FrontmatterData } from './frontmatter';

describe('frontmatter parser and serializer', () => {
  const sampleMarkdown = `---
title: "Learning activity 1.2"
activityCode: "cou2m_u1la2"
courseId: "cou2m"
unitNumber: 1
lessonNumber: 2
prompt: |
  # Sample Prompt
  Line 1
  Line 2
type: summary
version: 1
updatedAt: "2026-10-07"
---

# Heading 1

This is the body content.`;

  it('parses YAML frontmatter using native Bun.YAML in Bun environment', () => {
    const parsed = parseFrontmatter(sampleMarkdown);
    expect(parsed.frontmatter.title).toBe('Learning activity 1.2');
    expect(parsed.frontmatter.activityCode).toBe('cou2m_u1la2');
    expect(parsed.frontmatter.unitNumber).toBe(1);
    expect(parsed.frontmatter.version).toBe(1);
    expect(parsed.frontmatter.prompt).toContain('# Sample Prompt');
    expect(parsed.frontmatter.prompt).toContain('Line 1');
    expect(parsed.body).toBe('# Heading 1\n\nThis is the body content.');
  });

  it('serializes frontmatter and body into valid markdown', () => {
    const data: FrontmatterData = {
      title: 'New Title',
      version: 2,
      prompt: 'Prompt content here'
    };
    const body = 'Body content here.';
    const serialized = serializeWithFrontmatter(data, body);

    expect(serialized.startsWith('---\n')).toBe(true);
    expect(serialized).toContain('title:');
    expect(serialized).toContain('New Title');
    expect(serialized).toContain('version:');
    expect(serialized).toContain('Body content here.');

    // Round-trip verification
    const reparsed = parseFrontmatter(serialized);
    expect(reparsed.frontmatter.title).toBe('New Title');
    expect(reparsed.frontmatter.version).toBe(2);
    expect(reparsed.frontmatter.prompt).toBe('Prompt content here');
    expect(reparsed.body).toBe('Body content here.');
  });

  it('falls back to js-yaml when Bun.YAML is unavailable (browser environment simulation)', () => {
    const originalYaml = (globalThis as any).Bun?.YAML;
    try {
      // Simulate browser environment by setting Bun.YAML to undefined
      if ((globalThis as any).Bun) {
        (globalThis as any).Bun.YAML = undefined;
      }

      const parsed = parseFrontmatter(sampleMarkdown);
      expect(parsed.frontmatter.title).toBe('Learning activity 1.2');
      expect(parsed.frontmatter.activityCode).toBe('cou2m_u1la2');
      expect(parsed.frontmatter.unitNumber).toBe(1);
      expect(parsed.frontmatter.version).toBe(1);
      expect(parsed.frontmatter.prompt).toContain('# Sample Prompt');
      expect(parsed.body).toBe('# Heading 1\n\nThis is the body content.');

      // Test serialization in fallback mode
      const serialized = serializeWithFrontmatter(
        { title: 'Fallback Test', version: 3, prompt: 'Fallback Prompt' },
        'Fallback Body'
      );
      expect(serialized).toContain('Fallback Test');
      const reparsed = parseFrontmatter(serialized);
      expect(reparsed.frontmatter.title).toBe('Fallback Test');
      expect(reparsed.frontmatter.version).toBe(3);
      expect(reparsed.frontmatter.prompt).toBe('Fallback Prompt');
      expect(reparsed.body).toBe('Fallback Body');
    } finally {
      // Restore native Bun.YAML
      if ((globalThis as any).Bun && originalYaml) {
        (globalThis as any).Bun.YAML = originalYaml;
      }
    }
  });

  it('returns default prompt when no frontmatter block exists', () => {
    const plainMarkdown = '# Just Markdown\n\nNo frontmatter here.';
    const parsed = parseFrontmatter(plainMarkdown, 'Default fallback prompt');
    expect(parsed.frontmatter.prompt).toBe('Default fallback prompt');
    expect(parsed.body).toBe('# Just Markdown\n\nNo frontmatter here.');
  });

  it('ensures custom prompt overrides any frontmatter emitted in LLM completion', () => {
    // LLM outputs markdown that includes its own frontmatter block with original prompt
    const llmOutputWithFrontmatter = `---
prompt: |
  Generate 12 questions (original)
type: course_test
---
# 24 Questions Practice Exam
01) Question 1...`;

    const parsed = parseFrontmatter(llmOutputWithFrontmatter.trim());
    const customPrompt = 'Generate 24 questions (customized)';

    // Our new pattern ensures custom prompt is always the final word
    const finalContent = serializeWithFrontmatter(
      {
        ...parsed.frontmatter,
        type: 'course_test',
        updatedAt: '2026-10-08',
        prompt: customPrompt
      },
      parsed.body.trim()
    );

    const roundTrip = parseFrontmatter(finalContent);
    expect(roundTrip.frontmatter.prompt).toBe('Generate 24 questions (customized)');
    expect(roundTrip.body).toContain('# 24 Questions Practice Exam');
    expect(roundTrip.body).not.toContain('Generate 12 questions (original)');
  });

  it('TurndownConverter produces valid markdown and frontmatter without throwing when Bun is undefined', async () => {
    const { TurndownConverter } = await import('./turndownConverter');
    const converter = new TurndownConverter();

    const originalYaml = (globalThis as any).Bun?.YAML;
    try {
      if ((globalThis as any).Bun) {
        (globalThis as any).Bun.YAML = undefined;
      }

      const html = '<h1>Hello World</h1><p>Test paragraph</p>';
      const frontmatter = {
        title: 'Test Lesson',
        activityCode: 'u1la1',
        courseId: 'test_course',
        unit: 'Unit 1',
        unitNumber: 1,
        lessonNumber: 1,
        type: 'lesson' as const,
        savedAt: '2026-10-08'
      };

      const md = converter.convertToMarkdown(html, frontmatter);
      expect(md).toContain('title: Test Lesson');
      expect(md).toContain('# Hello World');
      expect(md).toContain('Test paragraph');

      const parsed = parseFrontmatter(md);
      expect(parsed.frontmatter.title).toBe('Test Lesson');
      expect(parsed.frontmatter.courseId).toBe('test_course');
      expect(parsed.body).toContain('# Hello World');
    } finally {
      if ((globalThis as any).Bun && originalYaml) {
        (globalThis as any).Bun.YAML = originalYaml;
      }
    }
  });
});

