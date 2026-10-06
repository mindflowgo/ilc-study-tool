import { json } from '@sveltejs/kit';
import { CourseService } from '$lib/server/courses';
import type { RequestHandler } from './$types';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import os from 'node:os';

export const POST: RequestHandler = async ({ params }) => {
  const courseId = params.course_id;
  const courseDir = path.join(CourseService.getCoursesDir(), courseId.toLowerCase());

  if (!fs.existsSync(courseDir)) {
    return json({ error: `Course folder not found: ${courseDir}` }, { status: 404 });
  }

  const platform = os.platform();
  const cmd =
    platform === 'darwin'
      ? `open "${courseDir}"`
      : platform === 'win32'
      ? `explorer "${courseDir}"`
      : `xdg-open "${courseDir}"`;

  return new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        console.error('Failed to open folder:', err);
        resolve(json({ error: err.message }, { status: 500 }));
      } else {
        resolve(json({ success: true, path: courseDir }));
      }
    });
  });
};
