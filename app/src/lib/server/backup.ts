import fs from 'node:fs';
import path from 'node:path';
import { zipSync, unzipSync } from 'fflate';
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
  // fflate: fast pure-JS zip that also works inside the compiled sidecar.
  const files: Record<string, Uint8Array> = {};

  let fileCount = 0;
  let courseCount = 0;

  const addTree = (absDir: string, relPrefix: string): void => {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const absPath = path.join(absDir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        addTree(absPath, relPath);
      } else if (entry.isFile()) {
        files[relPath] = new Uint8Array(fs.readFileSync(absPath));
        fileCount++;
      }
    }
  };

  if (fs.existsSync(dataDir)) {
    for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
      const fullPath = path.join(dataDir, entry.name);
      if (entry.isDirectory()) {
        addTree(fullPath, entry.name);
        if (entry.name === 'courses') {
          const courses = fs.readdirSync(fullPath, { withFileTypes: true });
          courseCount = courses.filter((c) => c.isDirectory()).length;
        }
      } else if (entry.isFile()) {
        files[entry.name] = new Uint8Array(fs.readFileSync(fullPath));
        fileCount++;
      }
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const filename = `ilc-study-tool-backup-${today}.zip`;
  const buffer = Buffer.from(zipSync(files, { level: 6 }));

  return { buffer, filename, courseCount, fileCount };
}

/**
 * Safely extracts a zip archive into the active data directory.
 * Defends against Zip Slip by ensuring all destination paths stay inside target directory.
 */
export function restoreDataBackupZip(buffer: Buffer, customTargetDir?: string): RestoreResult {
  const targetDir = customTargetDir || getDataDir();
  fs.mkdirSync(targetDir, { recursive: true });

  const entries = unzipSync(new Uint8Array(buffer));
  let filesRestored = 0;

  for (const [entryName, data] of Object.entries(entries)) {
    if (entryName.endsWith('/')) continue;

    // Defend against Zip Slip
    const cleanName = entryName.replace(/^[/\\]+/, '');
    const destinationPath = safeJoin(targetDir, cleanName);

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, Buffer.from(data));
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
