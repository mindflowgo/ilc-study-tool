import { json, error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { optimizeCourseImages } from '$lib/parser/imageOptimizer';
import { CourseService } from '$lib/server/courses';
import { assertCourseId, safeJoin } from '$lib/server/paths';
import type { RequestHandler } from './$types';

/**
 * Compresses oversized course images (>512px wide → 512px JPEG) and
 * normalizes markdown image size specs. Body: `{ courseId?: string }` —
 * omit `courseId` to process every course.
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const coursesDir = CourseService.getCoursesDir();

  let courseIds: string[];
  if (body?.courseId) {
    let courseId: string;
    try {
      courseId = assertCourseId(String(body.courseId)).toLowerCase();
    } catch {
      throw error(400, `Invalid courseId: "${body.courseId}"`);
    }
    const coursePath = safeJoin(coursesDir, courseId);
    if (!fs.existsSync(coursePath)) {
      throw error(404, `Course ${courseId} not found`);
    }
    courseIds = [courseId];
  } else {
    courseIds = fs
      .readdirSync(coursesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);
  }

  const results = [];
  for (const courseId of courseIds) {
    try {
      const summary = await optimizeCourseImages(path.join(coursesDir, courseId));
      results.push({ courseId, ...summary });
    } catch (e) {
      console.error(`[compress-images] Failed for ${courseId}:`, e);
      results.push({ courseId, error: e instanceof Error ? e.message : String(e) });
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
};
