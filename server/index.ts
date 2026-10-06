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
  assertPromptId,
  assertTab,
  PathValidationError,
  getDataStorageInfo,
  setCustomDataDir
} from '../app/src/lib/server/paths';
import { optimizeCourseImages } from '../app/src/lib/parser/imageOptimizer';
import { createDataBackupZip, restoreDataBackupZip } from '../app/src/lib/server/backup';

const PORT = parseInt(process.env.PORT || '3182', 10);
const APP_BUILD_DIR = path.resolve(import.meta.dir, '../app/build');

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key, x-api-key',
};

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

function error(status: number, message: string): Response {
  return json({ message, error: message }, status);
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
  '.ico': 'image/x-icon',
};

async function handleApiRequest(req: Request, url: URL): Promise<Response> {
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  try {
    // 1. LLM Endpoint
    if (pathname === '/api/llm') {
      if (method === 'GET') {
        const config = LLMService.loadStoredConfig();
        return json({
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
        });
      }

      if (method === 'POST') {
        const body = await req.json();
        const { action, config, systemPrompt, userPrompt, sessionId } = body;
        if (!config) return error(400, 'LLM config is required');

        if (config.baseUrl) {
          LLMService.saveStoredConfig(config as LLMConfig);
        }
        if (sessionId && !config.sessionId) {
          config.sessionId = sessionId;
        }

        if (action === 'save_config') {
          return json({ success: true, message: 'LLM configuration saved' });
        }
        if (action === 'test') {
          const result = await LLMService.testConnection(config as LLMConfig);
          return json(result);
        }
        if (action === 'generate') {
          if (!systemPrompt || !userPrompt) {
            return error(400, 'systemPrompt and userPrompt are required for generation');
          }
          const result = await LLMService.generateResult(config as LLMConfig, systemPrompt, userPrompt);
          return json({ success: true, completion: result.completion, usage: result.usage });
        }
        return error(400, `Unknown action: ${action}`);
      }
    }

    // 2. Queue Endpoint
    if (pathname === '/api/queue') {
      if (method === 'GET') {
        const courseId = url.searchParams.get('courseId') || undefined;
        return json(queueManager.getStatus(courseId));
      }
      if (method === 'POST') {
        const body = await req.json();
        const { action, tasks, courseId } = body;
        if (action === 'enqueue') {
          if (!Array.isArray(tasks) || tasks.length === 0) return error(400, 'Tasks array required');
          const added = queueManager.addTasks(tasks);
          return json({ success: true, addedCount: added.length });
        }
        if (action === 'pause') {
          queueManager.pause();
          return json({ success: true, message: 'Queue paused' });
        }
        if (action === 'resume') {
          queueManager.resume();
          return json({ success: true, message: 'Queue resumed' });
        }
        if (action === 'cancelAll') {
          queueManager.cancelAll(courseId);
          return json({ success: true, message: 'Pending tasks cancelled' });
        }
        if (action === 'retryFailed') {
          queueManager.retryFailed(courseId);
          return json({ success: true, message: 'Retrying failed tasks' });
        }
        return error(400, `Unknown action: ${action}`);
      }
    }

    // 3. Prompts Endpoint
    if (pathname === '/api/prompts') {
      if (method === 'GET') {
        return json({ prompts: PromptService.getAllPrompts() });
      }
      if (method === 'POST') {
        const body = await req.json();
        const { id, content, systemPrompt } = body;
        assertPromptId(id);
        const finalContent = content !== undefined ? content : systemPrompt;
        if (typeof finalContent !== 'string') return error(400, 'Prompt content is required');
        const item = PromptService.savePrompt(id, finalContent);
        return json({ success: true, prompt: item });
      }
    }

    // 4. Maintenance / Image Compression
    if (pathname === '/api/maintenance/compress-images' && method === 'POST') {
      const coursesDir = getCoursesDir();
      if (!fs.existsSync(coursesDir)) return json({ success: true, results: [], totals: { converted: 0, bytesBefore: 0, bytesAfter: 0 } });
      const entries = fs.readdirSync(coursesDir, { withFileTypes: true });
      const results: any[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const cId = entry.name.toLowerCase();
        try {
          const summary = await optimizeCourseImages(safeJoin(coursesDir, cId));
          results.push({ courseId: cId, ...summary });
        } catch (e: any) {
          results.push({ courseId: cId, error: e?.message || String(e) });
        }
      }
      const totals = results.reduce(
        (acc, r) => {
          if ('converted' in r) {
            return {
              converted: acc.converted + (r.converted || 0),
              bytesBefore: acc.bytesBefore + (r.bytesBefore || 0),
              bytesAfter: acc.bytesAfter + (r.bytesAfter || 0)
            };
          }
          return acc;
        },
        { converted: 0, bytesBefore: 0, bytesAfter: 0 }
      );
      return json({ success: true, results, totals });
    }

    // 4b. Storage Settings Endpoints
    if (pathname === '/api/settings/storage') {
      if (method === 'GET') {
        return json(getDataStorageInfo());
      }
      if (method === 'POST') {
        const body = await req.json();
        const { dataDir, migrate } = body;
        const result = setCustomDataDir(dataDir, Boolean(migrate));
        return json({
          success: true,
          ...getDataStorageInfo(),
          migratedFiles: result.migratedFiles
        });
      }
    }

    if (pathname === '/api/settings/open-folder' && method === 'POST') {
      const dataDir = getDataDir();
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const platform = process.platform;
      const binary = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open';
      execFile(binary, [dataDir], (err) => {
        if (err) console.error(`Failed to open data directory '${dataDir}':`, err);
      });
      return json({ success: true, message: `Opened ${dataDir}`, path: dataDir });
    }

    // 4c. Backup Export and Import Endpoints
    if (pathname === '/api/backup/export' && method === 'GET') {
      const { buffer, filename } = createDataBackupZip();
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS
        }
      });
    }

    if (pathname === '/api/backup/import' && method === 'POST') {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return error(400, 'A .zip backup file is required');
      if (!file.name.toLowerCase().endsWith('.zip')) {
        return error(400, 'Invalid file format. Please upload a .zip file.');
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = restoreDataBackupZip(buffer);
      return json({
        success: true,
        message: `Successfully restored ${result.coursesRestored} courses and ${result.filesRestored} files.`,
        ...result
      });
    }

    // 5. Courses List
    if (pathname === '/api/courses' && method === 'GET') {
      return json({ courses: CourseService.listCourses() });
    }

    // 6. Course-specific endpoints: /api/courses/:course_id/...
    const courseMatch = pathname.match(/^\/api\/courses\/([^\/]+)(?:\/(.*))?$/);
    if (courseMatch) {
      const courseId = courseMatch[1];
      assertCourseId(courseId);
      const subpath = courseMatch[2] || '';

      // GET /api/courses/:course_id
      if (!subpath && method === 'GET') {
        const course = CourseService.getCourse(courseId);
        if (!course) return error(404, `Course ${courseId} not found`);
        return json({ course });
      }

      // POST /api/courses/:course_id/open
      if (subpath === 'open' && method === 'POST') {
        const coursesDir = getCoursesDir();
        const courseDir = safeJoin(coursesDir, courseId.toLowerCase());
        if (!fs.existsSync(courseDir)) return error(404, `Course folder not found: ${courseId}`);

        const platform = process.platform;
        const binary = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open';
        execFile(binary, [courseDir], (err) => {
          if (err) console.error(`Failed to open course directory '${courseDir}':`, err);
        });
        return json({ success: true, message: `Opened ${courseDir}` });
      }

      // POST /api/courses/:course_id/course-docs
      if (subpath === 'course-docs' && method === 'POST') {
        const body = await req.json();
        const type = String(body.type || '').trim().toLowerCase();
        if (type !== 'summary' && type !== 'cheatsheet' && type !== 'test') {
          return error(400, 'Invalid document type. Must be summary, cheatsheet, or test.');
        }

        const coursesDir = getCoursesDir();
        const courseDir = safeJoin(coursesDir, courseId.toLowerCase());
        const targetFilename = `course.${type}.md`;
        const targetPath = safeJoin(courseDir, targetFilename);

        const forceRegenerate = Boolean(body.forceRegenerate);
        if (!forceRegenerate && fs.existsSync(targetPath)) {
          const content = fs.readFileSync(targetPath, 'utf8');
          return json({ success: true, filename: targetFilename, content, cached: true });
        }

        const config = LLMService.loadStoredConfig();
        if (!config || !config.baseUrl) {
          return error(400, 'LLM is not configured. Please open Settings or configure AI first.');
        }

        const lessonDocs = CourseService.collectLessonDocs(courseId, type);
        if (lessonDocs.length === 0) {
          return error(400, `No lesson ${type}s found to generate a course-level ${type}. Generate lesson ${type}s first.`);
        }

        const promptTemplate = PromptService.getPrompt(`course_${type}`);
        const systemPrompt = promptTemplate?.content || `You are an expert curriculum designer. Synthesize all lesson ${type}s into a comprehensive course-level ${type}.`;
        const payload = lessonDocs.map((doc) => `--- LESSON: ${doc.lessonTitle} (${doc.lessonId}) ---\n${doc.content}`).join('\n\n');

        const result = await LLMService.generateResult(config, systemPrompt, payload);
        const fileContent = `---\ntype: course_${type}\nupdatedAt: '${new Date().toISOString().split('T')[0]}'\n---\n\n${result.completion.trim()}\n`;
        fs.writeFileSync(targetPath, fileContent, 'utf8');
        return json({ success: true, filename: targetFilename, content: fileContent, generated: true });
      }

      // GET /api/courses/:course_id/assets/...
      const assetsMatch = subpath.match(/^assets\/(.+)$/);
      if (assetsMatch && method === 'GET') {
        const assetRelativePath = decodeURIComponent(assetsMatch[1]);
        const fullPath = CourseService.resolveAssetPath(courseId, assetRelativePath);
        if (!fullPath || !fs.existsSync(fullPath)) return error(404, 'Asset not found');

        const file = Bun.file(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(file, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            ...CORS_HEADERS
          }
        });
      }

      // GET or POST /api/courses/:course_id/:lesson_id
      const lessonMatch = subpath.match(/^([^\/]+)$/);
      if (lessonMatch) {
        const lessonId = lessonMatch[1];
        assertLessonId(lessonId);

        if (method === 'GET') {
          const bundle = CourseService.getLessonBundle(courseId, lessonId);
          if (!bundle) return error(404, `Lesson ${lessonId} not found`);
          return json(bundle);
        }

        if (method === 'POST') {
          const body = await req.json();
          const { tab, content, asNewVersion } = body;
          assertTab(tab);
          if (typeof content !== 'string') return error(400, 'Content must be a string');
          const result = CourseService.saveLessonTab(courseId, lessonId, tab, content, Boolean(asNewVersion));
          return json(result, result.success ? 200 : 500);
        }
      }
    }

    return error(404, `Not found: ${pathname}`);
  } catch (err: any) {
    if (err instanceof PathValidationError) {
      return error(400, err.message);
    }
    console.error(`[API Error] ${method} ${pathname}:`, err);
    return error(500, err?.message || 'Internal server error');
  }
}

// Bun HTTP Server
const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);

    // OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(req, url);
    }

    // Static frontend SPA serving (for production packaged app)
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
            ...CORS_HEADERS
          }
        });
      }

      // SPA Fallback: serve index.html for client-side routing
      const indexPath = path.join(APP_BUILD_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        return new Response(Bun.file(indexPath), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...CORS_HEADERS
          }
        });
      }
    }

    return new Response('ILC Study Tool Backend running', {
      headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS }
    });
  }
});

console.log(`[ILC Backend] Running on http://127.0.0.1:${server.port}`);
console.log(`[ILC Backend] Data directory: ${getDataDir()}`);
console.log(`[ILC Backend] Frontend dist: ${APP_BUILD_DIR}`);
