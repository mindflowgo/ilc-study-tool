import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs';

export interface ExtractedLessonArchive {
  zipFilename: string;
  htmlContent: string;
  htmlPathInZip: string;
  title: string;
  unitNumber: number;
  lessonNumber: number;
  activityCode: string;
  isAssignment: boolean;
}

export interface IngestAssetResult {
  filename: string;
  category: 'img' | 'icons' | 'locker_docs' | 'other';
  destinationPath: string;
}

export class ArchiveExtractor {
  /**
   * Extract assets and find lesson HTML inside an ILC zip file
   */
  static extractZip(
    zipPath: string,
    assetsOutputDir: string
  ): ExtractedLessonArchive | null {
    if (!fs.existsSync(zipPath)) {
      return null;
    }

    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    const zipBasename = path.basename(zipPath);

    // Identify unit and lesson numbers from filename (e.g. clu3m_u1la2.html.zip -> Unit 1, Lesson 2)
    const match = zipBasename.match(/u(\d+)la(\d+)(?:_assign(\d+))?/i);
    const unitNumber = match ? parseInt(match[1], 10) : 1;
    const lessonNumber = match ? parseInt(match[2], 10) : 1;
    const isAssignment = zipBasename.includes('assign') || !!(match && match[3]);
    const activityCode = zipBasename.replace(/\.html\.zip$/i, '').replace(/\.zip$/i, '');

    // Extract assets: img, icons, locker_docs
    fs.mkdirSync(path.join(assetsOutputDir, 'img'), { recursive: true });
    fs.mkdirSync(path.join(assetsOutputDir, 'icons'), { recursive: true });
    fs.mkdirSync(path.join(assetsOutputDir, 'locker_docs'), { recursive: true });

    let htmlContent = '';
    let htmlPathInZip = '';

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;

      // Check for assets
      if (entryName.includes('/assets/img/')) {
        const dest = path.join(assetsOutputDir, 'img', path.basename(entryName));
        if (!fs.existsSync(dest)) {
          fs.writeFileSync(dest, entry.getData());
        }
      } else if (entryName.includes('/assets/icons/')) {
        const dest = path.join(assetsOutputDir, 'icons', path.basename(entryName));
        if (!fs.existsSync(dest)) {
          fs.writeFileSync(dest, entry.getData());
        }
      } else if (entryName.includes('/assets/locker_docs/')) {
        const dest = path.join(assetsOutputDir, 'locker_docs', path.basename(entryName));
        if (!fs.existsSync(dest)) {
          fs.writeFileSync(dest, entry.getData());
        }
      }

      // Check for lesson/assignment HTML
      if (
        entryName.endsWith('.html') &&
        (entryName.includes('lessons/') || entryName.includes('assignments/'))
      ) {
        htmlContent = entry.getData().toString('utf8');
        htmlPathInZip = entryName;
      }
    }

    if (!htmlContent) {
      // Fallback: search for any main html file
      for (const entry of zipEntries) {
        if (entry.entryName.endsWith('.html') && !entry.entryName.includes('/alt/')) {
          htmlContent = entry.getData().toString('utf8');
          htmlPathInZip = entry.entryName;
          break;
        }
      }
    }

    if (!htmlContent) return null;

    // Extract title from HTML <title> tag
    const titleMatch = htmlContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : `${isAssignment ? 'Assignment' : 'Lesson'} ${unitNumber}.${lessonNumber}`;
    title = title.replace(/\s+/g, ' ');

    return {
      zipFilename: zipBasename,
      htmlContent,
      htmlPathInZip,
      title,
      unitNumber,
      lessonNumber,
      activityCode,
      isAssignment
    };
  }
}
