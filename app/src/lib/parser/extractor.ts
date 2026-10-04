import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs';

export interface ExtractedLessonArchive {
  zipFilename: string; // Filename of source package (.zip, .mhtml, .html)
  packageFilename: string;
  htmlContent: string;
  htmlPathInZip?: string;
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
   * Main extractor entrypoint: handles .zip, .mhtml, .mht, and .html lesson packages
   */
  static extract(
    filePath: string,
    assetsOutputDir: string
  ): ExtractedLessonArchive | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.zip') {
      return this.extractZip(filePath, assetsOutputDir);
    } else if (ext === '.mhtml' || ext === '.mht') {
      return this.extractMhtml(filePath, assetsOutputDir);
    } else if (ext === '.html' || ext === '.htm') {
      return this.extractHtml(filePath, assetsOutputDir);
    }
    return null;
  }

  /**
   * Extract assets and lesson HTML inside a Zip file (SCORM package or browser-saved complete page)
   */
  static extractZip(
    zipPath: string,
    assetsOutputDir: string
  ): ExtractedLessonArchive | null {
    if (!fs.existsSync(zipPath)) {
      return null;
    }

    const zip = new AdmZip(zipPath);
    // Ignore macOS resource forks and metadata
    const zipEntries = zip.getEntries().filter(
      (e) => !e.entryName.startsWith('__MACOSX') && !path.basename(e.entryName).startsWith('._')
    );
    const zipBasename = path.basename(zipPath);

    // Ensure asset directories exist
    fs.mkdirSync(path.join(assetsOutputDir, 'img'), { recursive: true });
    fs.mkdirSync(path.join(assetsOutputDir, 'icons'), { recursive: true });
    fs.mkdirSync(path.join(assetsOutputDir, 'locker_docs'), { recursive: true });

    let intermediateHtml = '';
    let lessonsHtml = '';
    let fallbackHtml = '';
    let htmlPathInZip = '';

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;
      const filename = path.basename(entryName);
      const ext = path.extname(filename).toLowerCase();

      // Extract image assets (.jpg, .jpeg, .png, .webp, .gif)
      if (/\.(png|jpe?g|gif|webp)$/i.test(ext)) {
        const dest = path.join(assetsOutputDir, 'img', filename);
        if (!fs.existsSync(dest)) {
          fs.writeFileSync(dest, entry.getData());
        }
      }
      // Extract icon/diagram SVGs (.svg)
      else if (/\.svg$/i.test(ext)) {
        const dest = path.join(assetsOutputDir, 'icons', filename);
        if (!fs.existsSync(dest)) {
          fs.writeFileSync(dest, entry.getData());
        }
      }
      // Extract documents & PDFs
      else if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(ext)) {
        const dest = path.join(assetsOutputDir, 'locker_docs', filename);
        if (!fs.existsSync(dest)) {
          fs.writeFileSync(dest, entry.getData());
        }
      }

      // Check for HTML lesson candidates
      if (ext === '.html' || ext === '.htm') {
        const text = entry.getData().toString('utf8');
        // Priority 1: intermediate.html (browser-saved SCORM iframe containing actual lesson content)
        if (entryName.includes('intermediate.html')) {
          intermediateHtml = text;
          htmlPathInZip = entryName;
        }
        // Priority 2: lessons/ or assignments/ folder
        else if (entryName.includes('lessons/') || entryName.includes('assignments/')) {
          lessonsHtml = text;
          htmlPathInZip = entryName;
        }
        // Priority 3: HTML with ILC-specific content markers
        else if (text.includes('ilcLearningGoals') || text.includes('mindsOn')) {
          if (!lessonsHtml) {
            lessonsHtml = text;
            htmlPathInZip = entryName;
          }
        }
        // Fallback: any outer HTML file (skip alternative transcripts if possible)
        else if (!fallbackHtml && !entryName.includes('/alt/')) {
          fallbackHtml = text;
          if (!htmlPathInZip) htmlPathInZip = entryName;
        }
      }
    }

    const htmlContent = intermediateHtml || lessonsHtml || fallbackHtml;
    if (!htmlContent) return null;

    const meta = this.parseLessonMetadata(zipBasename, htmlContent);

    return {
      zipFilename: zipBasename,
      packageFilename: zipBasename,
      htmlContent,
      htmlPathInZip,
      title: meta.title,
      unitNumber: meta.unitNumber,
      lessonNumber: meta.lessonNumber,
      activityCode: meta.activityCode,
      isAssignment: meta.isAssignment
    };
  }

  /**
   * Extract assets and lesson HTML from a browser-saved Single File Web Archive (.mhtml / .mht)
   */
  static extractMhtml(
    mhtmlPath: string,
    assetsOutputDir: string
  ): ExtractedLessonArchive | null {
    if (!fs.existsSync(mhtmlPath)) {
      return null;
    }

    const mhtmlBasename = path.basename(mhtmlPath);
    const raw = fs.readFileSync(mhtmlPath, 'utf8');

    fs.mkdirSync(path.join(assetsOutputDir, 'img'), { recursive: true });
    fs.mkdirSync(path.join(assetsOutputDir, 'icons'), { recursive: true });
    fs.mkdirSync(path.join(assetsOutputDir, 'locker_docs'), { recursive: true });

    // Locate boundary
    const boundaryMatch = raw.match(/boundary="?([^"\r\n]+)"?/i);
    if (!boundaryMatch) return null;

    const boundary = boundaryMatch[1];
    const rawParts = raw.split('--' + boundary);

    let lessonHtml = '';
    let fallbackHtml = '';

    for (const rawPart of rawParts) {
      if (rawPart.trim() === '--' || !rawPart.trim()) continue;
      const headerEnd = rawPart.search(/\r?\n\r?\n/);
      if (headerEnd === -1) continue;

      const headerText = rawPart.slice(0, headerEnd);
      const body = rawPart.slice(headerEnd).replace(/^(\r?\n)+/, '');

      const headers: Record<string, string> = {};
      headerText.split(/\r?\n(?![ \t])/).forEach((line) => {
        const colon = line.indexOf(':');
        if (colon !== -1) {
          const k = line.slice(0, colon).trim().toLowerCase();
          const v = line.slice(colon + 1).trim();
          headers[k] = v;
        }
      });

      const ctype = (headers['content-type'] || '').toLowerCase();
      const cloc = headers['content-location'] || headers['snapshot-content-location'] || '';
      const encoding = (headers['content-transfer-encoding'] || '').toLowerCase();
      const filename = path.basename(cloc.split('?')[0]);

      // Extract image assets
      if (ctype.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) {
        if (filename && filename !== '/' && filename.length > 2) {
          const isSvg = /\.svg$/i.test(filename) || ctype.includes('svg');
          const destDir = isSvg ? path.join(assetsOutputDir, 'icons') : path.join(assetsOutputDir, 'img');
          const dest = path.join(destDir, filename);
          if (!fs.existsSync(dest)) {
            const buf = encoding.includes('base64')
              ? Buffer.from(body.replace(/\s+/g, ''), 'base64')
              : Buffer.from(body, 'utf8');
            fs.writeFileSync(dest, buf);
          }
        }
      }

      // Extract document assets (.pdf, .docx, etc.)
      if (ctype.includes('pdf') || /\.(pdf|docx?|xlsx?)$/i.test(filename)) {
        if (filename && filename !== '/' && filename.length > 2) {
          const dest = path.join(assetsOutputDir, 'locker_docs', filename);
          if (!fs.existsSync(dest)) {
            const buf = encoding.includes('base64')
              ? Buffer.from(body.replace(/\s+/g, ''), 'base64')
              : Buffer.from(body, 'utf8');
            fs.writeFileSync(dest, buf);
          }
        }
      }

      // Extract HTML content
      if (ctype.includes('text/html')) {
        let decoded = body;
        if (encoding.includes('quoted-printable')) {
          decoded = this.decodeQuotedPrintable(body);
        } else if (encoding.includes('base64')) {
          decoded = Buffer.from(decoded.replace(/\s+/g, ''), 'base64').toString('utf8');
        }

        // Check if this part contains the actual lesson body
        if (
          cloc.includes('lessons/') ||
          cloc.includes('assignments/') ||
          cloc.includes('intermediate.html') ||
          decoded.includes('ilcLearningGoals') ||
          decoded.includes('mindsOn')
        ) {
          lessonHtml = decoded;
        } else if (!fallbackHtml && (decoded.includes('<body') || decoded.includes('<main'))) {
          fallbackHtml = decoded;
        }
      }
    }

    const htmlContent = lessonHtml || fallbackHtml;
    if (!htmlContent) return null;

    const meta = this.parseLessonMetadata(mhtmlBasename, htmlContent);

    return {
      zipFilename: mhtmlBasename,
      packageFilename: mhtmlBasename,
      htmlContent,
      htmlPathInZip: mhtmlBasename,
      title: meta.title,
      unitNumber: meta.unitNumber,
      lessonNumber: meta.lessonNumber,
      activityCode: meta.activityCode,
      isAssignment: meta.isAssignment
    };
  }

  /**
   * Extract assets and lesson HTML from standalone HTML file or HTML + companion folder
   */
  static extractHtml(
    htmlPath: string,
    assetsOutputDir: string
  ): ExtractedLessonArchive | null {
    if (!fs.existsSync(htmlPath)) return null;

    const htmlBasename = path.basename(htmlPath);
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    fs.mkdirSync(path.join(assetsOutputDir, 'img'), { recursive: true });
    fs.mkdirSync(path.join(assetsOutputDir, 'icons'), { recursive: true });
    fs.mkdirSync(path.join(assetsOutputDir, 'locker_docs'), { recursive: true });

    // Look for companion folder: e.g. "Lesson 1.1_files" or "Lesson 1.1.files"
    const dir = path.dirname(htmlPath);
    const stem = htmlBasename.replace(/\.(html|htm)$/i, '');
    const companionDirs = [
      path.join(dir, `${stem}_files`),
      path.join(dir, `${stem}.files`),
      path.join(dir, 'assets')
    ];

    for (const compDir of companionDirs) {
      if (fs.existsSync(compDir) && fs.statSync(compDir).isDirectory()) {
        const files = fs.readdirSync(compDir);
        for (const file of files) {
          const filePath = path.join(compDir, file);
          if (fs.statSync(filePath).isDirectory()) continue;
          const ext = path.extname(file).toLowerCase();
          if (/\.(png|jpe?g|gif|webp)$/i.test(ext)) {
            const dest = path.join(assetsOutputDir, 'img', file);
            if (!fs.existsSync(dest)) fs.copyFileSync(filePath, dest);
          } else if (/\.svg$/i.test(ext)) {
            const dest = path.join(assetsOutputDir, 'icons', file);
            if (!fs.existsSync(dest)) fs.copyFileSync(filePath, dest);
          } else if (/\.(pdf|docx?|xlsx?)$/i.test(ext)) {
            const dest = path.join(assetsOutputDir, 'locker_docs', file);
            if (!fs.existsSync(dest)) fs.copyFileSync(filePath, dest);
          }
        }
      }
    }

    const meta = this.parseLessonMetadata(htmlBasename, htmlContent);

    return {
      zipFilename: htmlBasename,
      packageFilename: htmlBasename,
      htmlContent,
      htmlPathInZip: htmlBasename,
      title: meta.title,
      unitNumber: meta.unitNumber,
      lessonNumber: meta.lessonNumber,
      activityCode: meta.activityCode,
      isAssignment: meta.isAssignment
    };
  }

  /**
   * Helper to parse unit number, lesson number, activity code, and clean title from filename & HTML content
   */
  static parseLessonMetadata(
    filename: string,
    htmlContent: string = ''
  ): {
    unitNumber: number;
    lessonNumber: number;
    activityCode: string;
    isAssignment: boolean;
    title: string;
  } {
    let unitNumber = 1;
    let lessonNumber = 1;
    let activityCode = '';
    let isAssignment = /assign/i.test(filename);

    // 1. Try u1la2 in filename
    const ulaMatch = filename.match(/u(\d+)la(\d+)(?:_assign(\d+))?/i);
    if (ulaMatch) {
      unitNumber = parseInt(ulaMatch[1], 10);
      lessonNumber = parseInt(ulaMatch[2], 10);
      if (ulaMatch[3]) isAssignment = true;
      activityCode = filename.replace(/\.(html\.zip|zip|mhtml|mht|html|htm)$/i, '');
    } else {
      // 2. Try "Learning activity 1.2" in filename
      const laMatch = filename.match(
        /(?:learning\s*activity|activity|lesson|unit)\s*(\d+)[\._\s]+(\d+)/i
      );
      if (laMatch) {
        unitNumber = parseInt(laMatch[1], 10);
        lessonNumber = parseInt(laMatch[2], 10);
      } else {
        // 3. Try "1.2"
        const numMatch = filename.match(/(\d+)[\._](\d+)/);
        if (numMatch) {
          unitNumber = parseInt(numMatch[1], 10);
          lessonNumber = parseInt(numMatch[2], 10);
        }
      }
    }

    // 4. Check HTML content for activityCode or unit/lesson if not resolved
    if (htmlContent) {
      const codeMatch = htmlContent.match(
        /(?:lessons|assignments)\/([a-zA-Z0-9_]+_u(\d+)la(\d+))/i
      );
      if (codeMatch) {
        activityCode = codeMatch[1];
        if (!ulaMatch) {
          unitNumber = parseInt(codeMatch[2], 10);
          lessonNumber = parseInt(codeMatch[3], 10);
        }
      }
    }

    if (!activityCode) {
      activityCode = `u${unitNumber}la${lessonNumber}`;
    }

    // Extract title
    let title = '';
    if (htmlContent) {
      const titleMatch = htmlContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].trim().replace(/\s+/g, ' ');
      }
      if (!title) {
        const h1Match = htmlContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1Match) {
          title = h1Match[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
        }
      }
    }
    if (!title) {
      title = filename.replace(/\.(html\.zip|zip|mhtml|mht|html|htm)$/i, '');
    }

    // Clean title
    title = title.replace(/^learning\s*activity\s*/i, '').trim();
    title = title.replace(/^(\d+\.\d+)[:\s_-]+/, '$1 ');

    return { unitNumber, lessonNumber, activityCode, isAssignment, title };
  }

  /**
   * Helper to decode quoted-printable text into a proper UTF-8 string
   */
  static decodeQuotedPrintable(str: string): string {
    const clean = str.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i++) {
      if (
        clean[i] === '=' &&
        i + 2 < clean.length &&
        /^[0-9A-Fa-f]{2}$/.test(clean.slice(i + 1, i + 3))
      ) {
        bytes.push(parseInt(clean.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(clean.charCodeAt(i));
      }
    }
    return Buffer.from(bytes).toString('utf8');
  }
}
