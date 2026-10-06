import { json } from '@sveltejs/kit';
import { CourseService } from '$lib/server/courses';
import { assertCourseId, safeJoin } from '$lib/server/paths';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';

export const POST: RequestHandler = async ({ params }) => {
  let courseDir: string;
  try {
    const safeCourseId = assertCourseId(params.course_id);
    courseDir = safeJoin(CourseService.getCoursesDir(), safeCourseId.toLowerCase());
  } catch (err: any) {
    return json({ error: err?.message || 'Invalid course identifier' }, { status: 400 });
  }

  if (!fs.existsSync(courseDir)) {
    return json({ error: `Course folder not found: ${courseDir}` }, { status: 404 });
  }

  const platform = os.platform();
  const binary =
    platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer.exe' : 'xdg-open';

  return new Promise((resolve) => {
    execFile(binary, [courseDir], (err) => {
      if (err) {
        console.error('Failed to open folder:', err);
        resolve(json({ error: err.message }, { status: 500 }));
      } else {
        resolve(json({ success: true, path: courseDir }));
      }
    });
  });
};
