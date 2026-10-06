import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { getDataDir, getCoursesDir, safeJoin } from './paths';

export interface RestoreResult {
  success: boolean;
  coursesRestored: number;
  filesRestored: number;
}

/**
 * Creates a zip archive containing all course data, prompts, and configs.
 */
export function createDataBackupZip(): {
  buffer: Buffer;
  filename: string;
  courseCount: number;
  fileCount: number;
} {
  const dataDir = getDataDir();
  const zip = new AdmZip();

  let fileCount = 0;
  let courseCount = 0;

  if (fs.existsSync(dataDir)) {
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dataDir, entry.name);
      if (entry.isDirectory()) {
        zip.addLocalFolder(fullPath, entry.name);
        if (entry.name === 'courses') {
          const courses = fs.readdirSync(fullPath, { withFileTypes: true });
          courseCount = courses.filter((c) => c.isDirectory()).length;
        }
      } else if (entry.isFile()) {
        zip.addLocalFile(fullPath);
      }
    }
    fileCount = zip.getEntries().filter((e) => !e.isDirectory).length;
  }

  const today = new Date().toISOString().split('T')[0];
  const filename = `ilc-study-tool-backup-${today}.zip`;
  const buffer = zip.toBuffer();

  return { buffer, filename, courseCount, fileCount };
}

/**
 * Safely extracts a zip archive into the active data directory.
 * Defends against Zip Slip by ensuring all destination paths stay inside target directory.
 */
export function restoreDataBackupZip(buffer: Buffer, customTargetDir?: string): RestoreResult {
  const targetDir = customTargetDir || getDataDir();
  fs.mkdirSync(targetDir, { recursive: true });

  const zip = new AdmZip(buffer);
  const zipEntries = zip.getEntries();

  let filesRestored = 0;

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;

    // Defend against Zip Slip
    const entryName = entry.entryName.replace(/^[/\\]+/, '');
    const destinationPath = safeJoin(targetDir, entryName);

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, entry.getData());
    filesRestored++;
  }

  const coursesDir = path.join(targetDir, 'courses');
  let coursesRestored = 0;
  if (fs.existsSync(coursesDir)) {
    coursesRestored = fs.readdirSync(coursesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory()).length;
  }

  return {
    success: true,
    coursesRestored,
    filesRestored
  };
}
