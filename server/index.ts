import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { CourseService } from '../app/src/lib/server/courses';
import { PromptService } from '../app/src/lib/server/prompts';
import { LLMService, type LLMConfig } from '../app/src/lib/server/llm';
import { queueManager } from '../app/src/lib/server/queue';
import {
  getDataDir,
  getCoursesDir,
  safeJoin,
  assertCourseId,
  assertLessonId,
  assertTab,
  PathValidationError,
  getDataStorageInfo,
  setCustomDataDir
} from '../app/src/lib/server/paths';
import { CourseIngest } from '../app/src/lib/parser/courseIngest';
import { optimizeCourseImages } from '../app/src/lib/parser/imageOptimizer';
import { createDataBackupZip, restoreDataBackupZip } from '../app/src/lib/server/backup';

const PORT = parseInt(process.env.PORT || '3182', 10);
const APP_BUILD_DIR = path.resolve(import.meta.dir, '../app/build');

/**
 * The packaged webview (tauri://localhost on macOS, http://tauri.localhost on
 * Windows) and local dev browsers are the only legitimate origins; anything
 * else gets no CORS headers. Bound to 127.0.0.1 so the loopback interface is
 * the only way in.
 */
const ALLOWED_ORIGIN_RE =
  /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https?:\/\/tauri\.localhost(:\d+)?|tauri:\/\/localhost)$/i;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  if (!origin || !ALLOWED_ORIGIN_RE.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key, x-api-key',
    Vary: 'Origin'
  };
}

function json(data: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cors
    }
  });
}

function error(status: number, message: string, cors: Record<string, string> = {}): Response {
  return json({ message }, status, cors);
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon'
};

type Tab = 'summary' | 'cheatsheet' | 'test';

async function handleApiRequest(req: Request, url: URL): Promise<Response> {
  const pathname = url.pathname;
  const method = req.method.toUpperCase();
  const cors = corsHeaders(req);

  try {
    // 1. LLM Endpoint
    if (pathname === '/api/llm') {
      if (method === 'GET') {
        const config = LLMService.loadStoredConfig();
        return json(
          {
            hasConfig: Boolean(config && config.baseUrl),
            config: config
              ? {
                  provider: config.provider,
                  baseUrl: config.baseUrl,
                  model: config.model,
                  authHeaderType: config.authHeaderType,
                  temperature: config.temperature,
                  hasApiKey: Boolean(config.apiKey)
                }
              : null
          },
          200,
          cors
        );
      }

      if (method === 'POST') {
        const body = (await req.json()) as Record<string, unknown>;
        const action = body.action as string | undefined;
        const config = body.config as LLMConfig | undefined;
        const { systemPrompt, userPrompt, sessionId } = body;
        if (!config) return error(400, 'LLM config is required', cors);

        if (config.baseUrl) {
          LLMService.saveStoredConfig(config);
        }
        if (sessionId && !config.sessionId) {
          config.sessionId = sessionId as string;
        }

        if (action === 'save_config') {
          return json({ success: true, message: 'LLM configuration saved' }, 200, cors);
        }
        if (action === 'test') {
          const result = await LLMService.testConnection(config);
          return json(result, 200, cors);
        }
        if (action === 'generate') {
          if (!systemPrompt || !userPrompt) {
            return error(400, 'systemPrompt and userPrompt are required for generation', cors);
          }
          const result = await LLMService.generateResult(
            config,
            systemPrompt as string,
            userPrompt as string
          );
          return json({ success: true, completion: result.completion, usage: result.usage }, 200, cors);
        }
        return error(400, `Unknown action: ${action}`, cors);
      }
    }

    // 2. Queue Endpoint — mirrors app/src/routes/api/queue/+server.ts
    if (pathname === '/api/queue') {
      if (method === 'GET') {
        const courseId = url.searchParams.get('courseId') || undefined;
        return json(queueManager.getStatus(courseId), 200, cors);
      }
      if (method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const {
          action,
          courseId,
          lessonId,
          lessonTitle,
          tab,
          tabs,
          asNewVersion,
          prompt,
          customPrompt,
          customConfig
        } = body;

        if (customConfig) {
          LLMService.saveStoredConfig(customConfig as LLMConfig);
        }

        if (action === 'enqueue') {
          if (!courseId) {
            return error(400, 'courseId is required to enqueue tasks', cors);
          }

          if (lessonId) {
            const targetTabs: Tab[] =
              (tabs as Tab[]) || (tab ? [tab as Tab] : ['summary', 'cheatsheet', 'test']);
            const items = targetTabs.map((t) => ({
              courseId: String(courseId),
              lessonId: String(lessonId),
              lessonTitle: String(lessonTitle || lessonId),
              tab: t,
              asNewVersion: Boolean(asNewVersion),
              customPrompt: (customPrompt || prompt) as string | undefined
            }));
            const enqueued = queueManager.enqueue(items, customConfig as LLMConfig | undefined);
            return json(
              { success: true, enqueued, status: queueManager.getStatus(String(courseId)) },
              200,
              cors
            );
          } else {
            const enqueued = queueManager.enqueueCourseMissing(
              String(courseId),
              (tabs as Tab[]) || ['summary', 'cheatsheet', 'test'],
              customConfig as LLMConfig | undefined
            );
            return json(
              { success: true, enqueued, status: queueManager.getStatus(String(courseId)) },
              200,
              cors
            );
          }
        }

        if (action === 'pause') {
          queueManager.pause();
          return json({ success: true, status: queueManager.getStatus(courseId as string | undefined) }, 200, cors);
        }
        if (action === 'resume') {
          queueManager.resume();
          return json({ success: true, status: queueManager.getStatus(courseId as string | undefined) }, 200, cors);
        }
        if (action === 'cancel') {
          queueManager.cancelAll(courseId as string | undefined);
          return json({ success: true, status: queueManager.getStatus(courseId as string | undefined) }, 200, cors);
        }
        if (action === 'retry') {
          queueManager.retryFailed(courseId as string | undefined);
          return json({ success: true, status: queueManager.getStatus(courseId as string | undefined) }, 200, cors);
        }
        return error(400, `Unknown action: ${action}`, cors);
      }
    }

    // 3. Prompts Endpoint — mirrors app/src/routes/api/prompts/+server.ts
    if (pathname === '/api/prompts') {
      if (method === 'GET') {
        return json({ prompts: PromptService.listPrompts() }, 200, cors);
      }
      if (method === 'POST') {
        const body = (await req.json()) as Record<string, unknown>;
        const { id, content } = body;
        if (!id || typeof content !== 'string') {
          return error(400, 'Invalid request: id and content required', cors);
        }
        try {
          const success = PromptService.savePrompt(String(id), content);
          if (!success) return error(500, 'Failed to save prompt', cors);
        } catch (err) {
          if (err instanceof PathValidationError) {
            return error(400, err.message, cors);
          }
          throw err;
        }
        return json({ success: true }, 200, cors);
      }
    }

    // 4. Parse Endpoint (chapter upload / re-parse) — mirrors app/src/routes/api/parse/+server.ts
    if (pathname === '/api/parse') {
      const contentType = req.headers.get('content-type') || '';

      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        const rawCourseId = ((formData.get('courseId') as string) || '').trim().toLowerCase() || 'new_course';
        let courseId: string;
        try {
          courseId = assertCourseId(rawCourseId).toLowerCase();
        } catch {
          return error(400, `Invalid courseId: "${rawCourseId}"`, cors);
        }

        const files = formData.getAll('files') as File[];
        const mode = (formData.get('mode') as string) || 'add';
        const targetLessonId = ((formData.get('targetLessonId') as string) || '').trim();
        if (targetLessonId) {
          try {
            assertLessonId(targetLessonId);
          } catch {
            return error(400, `Invalid targetLessonId: "${targetLessonId}"`, cors);
          }
        }
        const overwriteExisting = formData.get('overwriteExisting') === 'true';

        if (!files.length) {
          return error(400, 'No files provided', cors);
        }

        const courseDir = safeJoin(getCoursesDir(), courseId);
        const backupDir = safeJoin(courseDir, '_backup');
        fs.mkdirSync(backupDir, { recursive: true });

        const uploadedFilenames: string[] = [];
        for (const file of files) {
          const safeFilename = path.basename(file.name);
          if (/\.(zip|mhtml|mht|html|htm)$/i.test(safeFilename)) {
            const buffer = Buffer.from(await file.arrayBuffer());
            fs.writeFileSync(safeJoin(backupDir, safeFilename), buffer);
            uploadedFilenames.push(safeFilename);
          }
        }

        const ingester = new CourseIngest();
        const manifest = await ingester.ingestCourse(courseDir, {
          overwriteExisting: overwriteExisting || (mode === 'replace' && !targetLessonId),
          overwriteLessonIds: targetLessonId ? [targetLessonId] : undefined,
          overwriteFiles: mode === 'replace' ? uploadedFilenames : undefined
        });
        return json({ success: true, manifest }, 200, cors);
      }

      // JSON re-parse of existing courses
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const courseId = body.courseId as string | undefined;
      const overwriteExisting = Boolean(body.overwriteExisting);
      const lessonId = body.lessonId ? String(body.lessonId).trim() : undefined;

      const coursesDir = getCoursesDir();
      const ingester = new CourseIngest();

      if (courseId) {
        let safeCourseId: string;
        try {
          safeCourseId = assertCourseId(courseId).toLowerCase();
          if (lessonId) assertLessonId(lessonId);
        } catch {
          return error(400, `Invalid courseId or lessonId: "${courseId}"`, cors);
        }

        const coursePath = safeJoin(coursesDir, safeCourseId);
        if (!fs.existsSync(coursePath)) {
          return error(404, `Course ${courseId} not found`, cors);
        }
        const manifest = await ingester.ingestCourse(coursePath, {
          overwriteExisting,
          overwriteLessonIds: lessonId ? [lessonId] : undefined
        });
        return json({ success: true, manifest }, 200, cors);
      } else {
        const dirs = fs
          .readdirSync(coursesDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
          .map((d) => d.name);

        const manifests: unknown[] = [];
        for (const d of dirs) {
          try {
            const m = await ingester.ingestCourse(path.join(coursesDir, d));
            manifests.push(m);
          } catch (e) {
            console.error(`Failed to ingest ${d}:`, e);
          }
        }
        return json({ success: true, manifests }, 200, cors);
      }
    }

    // 5. Maintenance / Image Compression
    if (pathname === '/api/maintenance/compress-images' && method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const coursesDir = getCoursesDir();
      if (!fs.existsSync(coursesDir)) {
        return json(
          { success: true, results: [], totals: { converted: 0, bytesBefore: 0, bytesAfter: 0 } },
          200,
          cors
        );
      }
      const requested = body.courseId ? String(body.courseId).toLowerCase() : null;
      const entries = fs
        .readdirSync(coursesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && (!requested || d.name === requested));

      const results: Array<Record<string, unknown>> = [];
      for (const entry of entries) {
        const cId = entry.name.toLowerCase();
        try {
          const summary = await optimizeCourseImages(safeJoin(coursesDir, cId));
          results.push({ courseId: cId, ...summary });
        } catch (e) {
          results.push({ courseId: cId, error: e instanceof Error ? e.message : String(e) });
        }
      }
      const totals = results.reduce<{ converted: number; bytesBefore: number; bytesAfter: number }>(
        (acc, r) => ({
          converted: acc.converted + (Number(r.converted) || 0),
          bytesBefore: acc.bytesBefore + (Number(r.bytesBefore) || 0),
          bytesAfter: acc.bytesAfter + (Number(r.bytesAfter) || 0)
        }),
        { converted: 0, bytesBefore: 0, bytesAfter: 0 }
      );
      return json({ success: true, results, totals }, 200, cors);
    }

    // 6. Storage Settings Endpoints
    if (pathname === '/api/settings/storage') {
      if (method === 'GET') {
        return json(getDataStorageInfo(), 200, cors);
      }
      if (method === 'POST') {
        const body = (await req.json()) as Record<string, unknown>;
        const result = setCustomDataDir(String(body.dataDir || ''), Boolean(body.migrate));
        return json(
          {
            success: true,
            ...getDataStorageInfo(),
            migratedFiles: result.migratedFiles
          },
          200,
          cors
        );
      }
    }

    if (pathname === '/api/settings/open-folder' && method === 'POST') {
      const dataDir = getDataDir();
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const platform = process.platform;
      const binary = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open';
      execFile(binary, [dataDir], (err: Error | null) => {
        if (err) console.error(`Failed to open data directory '${dataDir}':`, err);
      });
      return json({ success: true, message: `Opened ${dataDir}`, path: dataDir }, 200, cors);
    }

    // 7. Backup Export and Import Endpoints
    if (pathname === '/api/backup/export' && method === 'GET') {
      const { buffer, filename } = createDataBackupZip();
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache',
          ...cors
        }
      });
    }

    if (pathname === '/api/backup/import' && method === 'POST') {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return error(400, 'A .zip backup file is required', cors);
      if (!file.name.toLowerCase().endsWith('.zip')) {
        return error(400, 'Invalid file format. Please upload a .zip file.', cors);
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = restoreDataBackupZip(buffer);
      return json(
        {
          ...result,
          message: `Successfully restored ${result.coursesRestored} courses and ${result.filesRestored} files.`
        },
        200,
        cors
      );
    }

    // 8. Courses List
    if (pathname === '/api/courses' && method === 'GET') {
      return json({ courses: CourseService.listCourses() }, 200, cors);
    }

    // 9. Course-specific endpoints: /api/courses/:course_id/...
    const courseMatch = pathname.match(/^\/api\/courses\/([^/]+)(?:\/(.*))?$/);
    if (courseMatch) {
      const courseId = courseMatch[1];
      assertCourseId(courseId);
      const subpath = courseMatch[2] || '';

      // GET /api/courses/:course_id
      if (!subpath && method === 'GET') {
        const course = CourseService.getCourse(courseId);
        if (!course) return error(404, `Course ${courseId} not found`, cors);
        return json({ course }, 200, cors);
      }

      // POST /api/courses/:course_id/open
      if (subpath === 'open' && method === 'POST') {
        const coursesDir = getCoursesDir();
        const courseDir = safeJoin(coursesDir, courseId.toLowerCase());
        if (!fs.existsSync(courseDir)) return error(404, `Course folder not found: ${courseId}`, cors);

        const platform = process.platform;
        const binary = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open';
        execFile(binary, [courseDir], (err: Error | null) => {
          if (err) console.error(`Failed to open course directory '${courseDir}':`, err);
        });
        return json({ success: true, message: `Opened ${courseDir}` }, 200, cors);
      }

      // POST /api/courses/:course_id/course-docs
      if (subpath === 'course-docs' && method === 'POST') {
        const body = (await req.json()) as Record<string, unknown>;
        const type = String(body.type || '').trim().toLowerCase();
        if (type !== 'summary' && type !== 'cheatsheet' && type !== 'test') {
          return error(400, 'Invalid document type. Must be summary, cheatsheet, or test.', cors);
        }

        const coursesDir = getCoursesDir();
        const courseDir = safeJoin(coursesDir, courseId.toLowerCase());
        const targetFilename = `course.${type}.md`;
        const targetPath = safeJoin(courseDir, targetFilename);

        const forceRegenerate = Boolean(body.forceRegenerate);
        if (!forceRegenerate && fs.existsSync(targetPath)) {
          const content = fs.readFileSync(targetPath, 'utf8');
          return json({ success: true, filename: targetFilename, content, cached: true }, 200, cors);
        }

        const config = LLMService.loadStoredConfig();
        if (!config || !config.baseUrl) {
          return error(400, 'LLM is not configured. Please open Settings or configure AI first.', cors);
        }

        const lessonDocs = CourseService.gatherLessonFiles(courseId, type);
        if (lessonDocs.length === 0) {
          return error(
            400,
            `No lesson ${type}s found to generate a course-level ${type}. Generate lesson ${type}s first.`,
            cors
          );
        }

        const promptTemplate = PromptService.getPrompt(`course_${type}`);
        const systemPrompt =
          promptTemplate?.content ||
          `You are an expert curriculum designer. Synthesize all lesson ${type}s into a comprehensive course-level ${type}.`;
        const payload = lessonDocs
          .map((doc) => `--- LESSON: ${doc.lessonTitle} (${doc.lessonId}) ---\n${doc.content}`)
          .join('\n\n');

        const result = await LLMService.generateResult(config, systemPrompt, payload);
        const fileContent = `---\ntype: course_${type}\nupdatedAt: '${new Date().toISOString().split('T')[0]}'\n---\n\n${result.completion.trim()}\n`;
        fs.writeFileSync(targetPath, fileContent, 'utf8');
        return json({ success: true, filename: targetFilename, content: fileContent, generated: true }, 200, cors);
      }

      // GET /api/courses/:course_id/assets/...
      const assetsMatch = subpath.match(/^assets\/(.+)$/);
      if (assetsMatch && method === 'GET') {
        const assetRelativePath = decodeURIComponent(assetsMatch[1]);
        const fullPath = CourseService.resolveAssetPath(courseId, assetRelativePath);
        if (!fullPath || !fs.existsSync(fullPath)) return error(404, 'Asset not found', cors);

        const file = Bun.file(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(file, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            ...cors
          }
        });
      }

      // Lesson endpoints — mirrors app/src/routes/api/courses/[course_id]/[lesson_id]/+server.ts
      const lessonMatch = subpath.match(/^([^/]+)$/);
      if (lessonMatch) {
        const lessonId = lessonMatch[1];
        assertLessonId(lessonId);

        if (method === 'GET') {
          const bundle = CourseService.getLessonContent(courseId, lessonId);
          if (!bundle) return error(404, `Lesson ${lessonId} not found`, cors);
          return json(bundle, 200, cors);
        }

        if (method === 'PUT') {
          const body = (await req.json()) as Record<string, unknown>;
          const { tab, content, asNewVersion } = body;
          assertTab(tab);
          if (typeof content !== 'string') {
            return error(400, 'Invalid request: content string required', cors);
          }
          const result = CourseService.saveLessonTab(courseId, lessonId, tab as string, content, {
            asNewVersion: Boolean(asNewVersion)
          });
          if (!result.success) {
            return error(500, `Failed to save ${tab} for lesson ${lessonId}`, cors);
          }
          return json(result, 200, cors);
        }
      }
    }

    return error(404, `Not found: ${pathname}`, cors);
  } catch (err) {
    if (err instanceof PathValidationError) {
      return error(400, err.message, corsHeaders(req));
    }
    console.error(`[API Error] ${method} ${pathname}:`, err);
    return error(500, err instanceof Error ? err.message : 'Internal server error', corsHeaders(req));
  }
}

// Bun HTTP Server — loopback only; the packaged webview talks to it directly.
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const cors = corsHeaders(req);

    // OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(req, url);
    }

    // Static frontend SPA serving (only meaningful when run from the repo checkout)
    if (fs.existsSync(APP_BUILD_DIR)) {
      let reqPath = url.pathname;
      if (reqPath === '/' || !reqPath) reqPath = '/index.html';
      const safePath = path.normalize(path.join(APP_BUILD_DIR, reqPath));
      if (safePath.startsWith(APP_BUILD_DIR) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(Bun.file(safePath), {
          headers: {
            'Content-Type': contentType,
            ...cors
          }
        });
      }

      // SPA Fallback: serve index.html for client-side routing
      const indexPath = path.join(APP_BUILD_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        return new Response(Bun.file(indexPath), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...cors
          }
        });
      }
    }

    return new Response('ILC Study Tool Backend running', {
      headers: { 'Content-Type': 'text/plain', ...cors }
    });
  }
});

console.log(`[ILC Backend] Running on http://127.0.0.1:${server.port}`);
console.log(`[ILC Backend] Data directory: ${getDataDir()}`);
console.log(`[ILC Backend] Frontend dist: ${APP_BUILD_DIR}`);
