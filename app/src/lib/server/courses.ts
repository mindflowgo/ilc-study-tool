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

export interface LessonContentBundle {
  courseId: string;
  lessonId: string;
  lesson: string;
  summary: string;
  cheatsheet: string;
  test: string;
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

  static getLessonContent(courseId: string, lessonId: string): LessonContentBundle | null {
    const courseDir = path.join(this.getCoursesDir(), courseId.toLowerCase());
    if (!fs.existsSync(courseDir)) return null;

    const readSafe = (filename: string): string => {
      const filePath = path.join(courseDir, filename);
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    };

    return {
      courseId,
      lessonId,
      lesson: readSafe(`${lessonId}.lesson.md`),
      summary: readSafe(`${lessonId}.summary.md`),
      cheatsheet: readSafe(`${lessonId}.cheatsheet.md`),
      test: readSafe(`${lessonId}.test.md`)
    };
  }

  static saveLessonTab(
    courseId: string,
    lessonId: string,
    tab: 'lesson' | 'summary' | 'cheatsheet' | 'test',
    content: string
  ): boolean {
    const courseDir = path.join(this.getCoursesDir(), courseId.toLowerCase());
    if (!fs.existsSync(courseDir)) return false;

    const filename = `${lessonId}.${tab}.md`;
    const filePath = path.join(courseDir, filename);

    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    } catch (e) {
      console.error(`Failed to save ${filename}:`, e);
      return false;
    }
  }

  static resolveAssetPath(courseId: string, subPath: string): string | null {
    const sanitized = path.normalize(subPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(this.getCoursesDir(), courseId.toLowerCase(), 'assets', sanitized);
    return fs.existsSync(fullPath) ? fullPath : null;
  }
}
