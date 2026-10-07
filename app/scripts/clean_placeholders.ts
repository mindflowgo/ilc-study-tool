import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '../data/courses');

function parseFrontmatter(fileContent: string): { frontmatter: Record<string, any>; body: string } {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: fileContent };
  }
  try {
    const frontmatter = ((globalThis as any).Bun.YAML.parse(match[1]) as Record<string, any>) || {};
    return { frontmatter, body: match[2] };
  } catch {
    return { frontmatter: {}, body: fileContent };
  }
}

function serializeFrontmatter(frontmatter: Record<string, any>, body: string): string {
  const yamlStr = (globalThis as any).Bun.YAML.stringify(frontmatter).replace(/\n?$/, '\n');
  return `---\n${yamlStr}---\n\n${body.trim()}\n`;
}

function run() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error('Data dir not found:', DATA_DIR);
    return;
  }

  const courses = fs.readdirSync(DATA_DIR).filter((d) => fs.statSync(path.join(DATA_DIR, d)).isDirectory() && !d.startsWith('.'));

  let cleanedSummaries = 0;
  let cleanedCheatsheets = 0;
  let cleanedTests = 0;

  for (const courseId of courses) {
    const courseDir = path.join(DATA_DIR, courseId);
    const files = fs.readdirSync(courseDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const fullPath = path.join(courseDir, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(raw);

      const baseLessonId = file.replace(/\.(summary|cheatsheet|test|lesson)(-\d+)?\.md$/, '');
      const lessonFile = path.join(courseDir, `${baseLessonId}.lesson.md`);
      let title = baseLessonId;
      if (fs.existsSync(lessonFile)) {
        const lessonRaw = fs.readFileSync(lessonFile, 'utf8');
        const lessonParsed = parseFrontmatter(lessonRaw);
        if (lessonParsed.frontmatter.title) {
          title = lessonParsed.frontmatter.title;
        }
      }

      // Check summary
      if (file.endsWith('.summary.md') || file.includes('.summary-')) {
        if (
          body.includes('This learning activity investigates key concepts under') ||
          body.includes('Legal Significance: Assessing how key decisions')
        ) {
          const newBody = `# Summary: ${title}\n\n*Not yet generated. This summary can be generated using the AI button above or automatically in the background.*`;
          fs.writeFileSync(fullPath, serializeFrontmatter(frontmatter, newBody), 'utf8');
          cleanedSummaries++;
        }
      }

      // Check cheatsheet
      if (file.endsWith('.cheatsheet.md') || file.includes('.cheatsheet-')) {
        if (
          body.includes('Roncarelli v. Duplessis') ||
          (courseId !== 'clu3m' && body.includes('Rule of Law'))
        ) {
          const newBody = `# Cheatsheet: ${title}\n\n*Not yet generated. This cheatsheet can be generated using the AI button above or automatically in the background.*`;
          fs.writeFileSync(fullPath, serializeFrontmatter(frontmatter, newBody), 'utf8');
          cleanedCheatsheets++;
        }
      }

      // Check test
      if (file.endsWith('.test.md') || file.includes('.test-')) {
        if (
          body.includes('essential difference between a rule and a law in Canadian jurisprudence') ||
          body.includes('Roncarelli')
        ) {
          const courseCode = `${courseId.toUpperCase()}.${baseLessonId}`;
          const newBody = `course: ${courseCode}\n\n# Practice Test: ${title}\n\n*Not yet generated. This practice test can be generated using the AI button above or automatically in the background.*`;
          fs.writeFileSync(fullPath, serializeFrontmatter(frontmatter, newBody), 'utf8');
          cleanedTests++;
        }
      }
    }
  }

  console.log(`✅ Cleaned placeholders: ${cleanedSummaries} summaries, ${cleanedCheatsheets} cheatsheets, ${cleanedTests} tests.`);
}

run();
