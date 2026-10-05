import fs from 'node:fs';
import path from 'node:path';
import type { CourseManifest } from '../parser/courseIngest';

function getDataDir(): string {
  // Check environment variable or resolve relative to workspace
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    return process.env.DATA_DIR;
  }
  // Try relative to app or relative to root
  const candidate1 = path.resolve(process.cwd(), 'data');
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), '..', 'data');
  if (fs.existsSync(candidate2)) return candidate2;

  return path.resolve(process.cwd(), 'data');
}

export interface LessonFileVersion {
  id: string; // e.g. "summary" or "summary-2"
  filename: string; // e.g. "01.02.summary.md" or "01.02.summary-2.md"
  versionNumber: number; // 1, 2, 3...
  label: string; // "v1", "v2", ...
  content: string;
}

export interface LessonContentBundle {
  courseId: string;
  lessonId: string;
  lesson: string;
  summary: string;
  cheatsheet: string;
  test: string;
  summaries: LessonFileVersion[];
  cheatsheets: LessonFileVersion[];
  tests: LessonFileVersion[];
}

export class CourseService {
  static getCoursesDir(): string {
    return path.join(getDataDir(), 'courses');
  }

  static listCourses(): CourseManifest[] {
    const coursesDir = this.getCoursesDir();
    if (!fs.existsSync(coursesDir)) return [];

    const dirs = fs
      .readdirSync(coursesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);

    const manifests: CourseManifest[] = [];

    for (const dirName of dirs) {
      const metaPath = path.join(coursesDir, dirName, 'meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const content = fs.readFileSync(metaPath, 'utf8');
          manifests.push(JSON.parse(content));
        } catch (e) {
          console.error(`Failed to read meta.json for ${dirName}:`, e);
        }
      }
    }

    return manifests;
  }

  static getCourse(courseId: string): CourseManifest | null {
    const metaPath = path.join(this.getCoursesDir(), courseId.toLowerCase(), 'meta.json');
    if (!fs.existsSync(metaPath)) return null;

    try {
      const content = fs.readFileSync(metaPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  static getManifest(courseId: string): CourseManifest | null {
    return this.getCourse(courseId);
  }

  static getLessonContent(courseId: string, lessonId: string): LessonContentBundle | null {
    const courseDir = path.join(this.getCoursesDir(), courseId.toLowerCase());
    if (!fs.existsSync(courseDir)) return null;

    const files = fs.readdirSync(courseDir);

    const getVersions = (tabPrefix: 'summary' | 'cheatsheet' | 'test'): LessonFileVersion[] => {
      const regex = new RegExp(`^${lessonId.replace('.', '\\.')}\\.${tabPrefix}(?:-(\\d+))?\\.md$`, 'i');
      return files
        .filter((f) => regex.test(f))
        .map((f) => {
          const match = f.match(regex);
          const versionNum = match && match[1] ? parseInt(match[1], 10) : 1;
          const versionId = versionNum === 1 ? tabPrefix : `${tabPrefix}-${versionNum}`;
          const content = fs.readFileSync(path.join(courseDir, f), 'utf8');
          return {
            id: versionId,
            filename: f,
            versionNumber: versionNum,
            label: `v${versionNum}`,
            content
          };
        })
        .sort((a, b) => a.versionNumber - b.versionNumber);
    };

    const summaries = getVersions('summary');
    const cheatsheets = getVersions('cheatsheet');
    const tests = getVersions('test');

    const readSafe = (filename: string): string => {
      const filePath = path.join(courseDir, filename);
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    };

    return {
      courseId,
      lessonId,
      lesson: readSafe(`${lessonId}.lesson.md`),
      summary: summaries[0]?.content || readSafe(`${lessonId}.summary.md`),
      cheatsheet: cheatsheets[0]?.content || readSafe(`${lessonId}.cheatsheet.md`),
      test: tests[0]?.content || readSafe(`${lessonId}.test.md`),
      summaries,
      cheatsheets,
      tests
    };
  }

  static getLessonBundle(courseId: string, lessonId: string): LessonContentBundle | null {
    return this.getLessonContent(courseId, lessonId);
  }

  static saveLessonTab(
    courseId: string,
    lessonId: string,
    tab: string,
    content: string,
    options?: { asNewVersion?: boolean }
  ): { success: boolean; versionId: string; filename: string } {
    const courseDir = path.join(this.getCoursesDir(), courseId.toLowerCase());
    if (!fs.existsSync(courseDir)) {
      return { success: false, versionId: tab, filename: '' };
    }

    let targetTab = tab;
    const baseTab = tab.replace(/-\d+$/, ''); // 'summary', 'cheatsheet', or 'test'

    if (options?.asNewVersion && ['summary', 'cheatsheet', 'test'].includes(baseTab)) {
      const files = fs.readdirSync(courseDir);
      const regex = new RegExp(`^${lessonId.replace('.', '\\.')}\\.${baseTab}(?:-(\\d+))?\\.md$`, 'i');
      let maxVersion = 1;
      for (const f of files) {
        const m = f.match(regex);
        if (m) {
          const num = m[1] ? parseInt(m[1], 10) : 1;
          if (num > maxVersion) maxVersion = num;
        }
      }
      const nextVersion = maxVersion + 1;
      targetTab = `${baseTab}-${nextVersion}`;
    }

    const filename = `${lessonId}.${targetTab}.md`;
    const filePath = path.join(courseDir, filename);

    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, versionId: targetTab, filename };
    } catch (e) {
      console.error(`Failed to save ${filename}:`, e);
      return { success: false, versionId: targetTab, filename };
    }
  }

  static resolveAssetPath(courseId: string, subPath: string): string | null {
    const sanitized = path.normalize(subPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(this.getCoursesDir(), courseId.toLowerCase(), 'assets', sanitized);
    return fs.existsSync(fullPath) ? fullPath : null;
  }
}
