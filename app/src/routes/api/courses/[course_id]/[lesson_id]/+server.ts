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
  const { tab, content } = body;

  if (!tab || typeof content !== 'string') {
    throw error(400, 'Invalid request: tab and content are required');
  }

  if (!['lesson', 'summary', 'cheatsheet', 'test'].includes(tab)) {
    throw error(400, `Invalid tab: ${tab}`);
  }

  const success = CourseService.saveLessonTab(params.course_id, params.lesson_id, tab as any, content);
  if (!success) {
    throw error(500, `Failed to save ${tab} for lesson ${params.lesson_id}`);
  }

  return json({ success: true });
};
