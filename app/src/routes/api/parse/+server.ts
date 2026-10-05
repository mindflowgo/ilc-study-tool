import { json, error } from '@sveltejs/kit';
import path from 'node:path';
import fs from 'node:fs';
import { CourseIngest } from '$lib/parser/courseIngest';
import { CourseService } from '$lib/server/courses';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const contentType = request.headers.get('content-type') || '';

  // If multipart form data (file upload)
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const courseId = (formData.get('courseId') as string)?.trim().toLowerCase() || 'new_course';
    const files = formData.getAll('files') as File[];
    const mode = (formData.get('mode') as string) || 'add';
    const targetLessonId = (formData.get('targetLessonId') as string)?.trim() || '';
    const overwriteExisting = formData.get('overwriteExisting') === 'true';

    if (!files.length) {
      throw error(400, 'No files provided');
    }

    const courseDir = path.join(CourseService.getCoursesDir(), courseId);
    const backupDir = path.join(courseDir, '_backup');
    fs.mkdirSync(backupDir, { recursive: true });

    const uploadedFilenames: string[] = [];
    for (const file of files) {
      if (/\.(zip|mhtml|mht|html|htm)$/i.test(file.name)) {
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(path.join(backupDir, file.name), buffer);
        uploadedFilenames.push(file.name);
      }
    }

    const ingester = new CourseIngest();
    const manifest = await ingester.ingestCourse(courseDir, {
      overwriteExisting: overwriteExisting || (mode === 'replace' && !targetLessonId),
      overwriteLessonIds: targetLessonId ? [targetLessonId] : undefined,
      overwriteFiles: mode === 'replace' ? uploadedFilenames : undefined
    });

    return json({ success: true, manifest });
  }

  // JSON request to re-parse existing course
  const body = await request.json().catch(() => ({}));
  const courseId = body.courseId;
  const overwriteExisting = Boolean(body.overwriteExisting);
  const lessonId = body.lessonId ? String(body.lessonId).trim() : undefined;

  const coursesDir = CourseService.getCoursesDir();
  const ingester = new CourseIngest();

  if (courseId) {
    const coursePath = path.join(coursesDir, courseId);
    if (!fs.existsSync(coursePath)) {
      throw error(404, `Course ${courseId} not found`);
    }
    const manifest = await ingester.ingestCourse(coursePath, {
      overwriteExisting,
      overwriteLessonIds: lessonId ? [lessonId] : undefined
    });
    return json({ success: true, manifest });
  } else {
    // Re-parse all
    const dirs = fs
      .readdirSync(coursesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);

    const manifests = [];
    for (const d of dirs) {
      try {
        const m = await ingester.ingestCourse(path.join(coursesDir, d));
        manifests.push(m);
      } catch (e) {
        console.error(`Failed to ingest ${d}:`, e);
      }
    }
    return json({ success: true, manifests });
  }
};
