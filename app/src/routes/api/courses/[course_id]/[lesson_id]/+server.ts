import { json, error } from '@sveltejs/kit';
import { CourseService } from '$lib/server/courses';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const bundle = CourseService.getLessonContent(params.course_id, params.lesson_id);
  if (!bundle) {
    throw error(404, `Lesson ${params.lesson_id} not found in ${params.course_id}`);
  }
  return json(bundle);
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const { tab, content, asNewVersion } = body;

  if (!tab || typeof content !== 'string') {
    throw error(400, 'Invalid request: tab and content are required');
  }

  const baseTab = tab.replace(/-\d+$/, '');
  if (!['lesson', 'summary', 'cheatsheet', 'test'].includes(baseTab)) {
    throw error(400, `Invalid tab identifier: ${tab}`);
  }

  const result = CourseService.saveLessonTab(
    params.course_id,
    params.lesson_id,
    tab,
    content,
    { asNewVersion: !!asNewVersion }
  );

  if (!result.success) {
    throw error(500, `Failed to save ${tab} for lesson ${params.lesson_id}`);
  }

  return json(result);
};
