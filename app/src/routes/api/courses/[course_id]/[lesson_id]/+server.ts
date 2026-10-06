import { json, error } from '@sveltejs/kit';
import { CourseService } from '$lib/server/courses';
import { assertCourseId, assertLessonId, assertTab, PathValidationError } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    assertCourseId(params.course_id);
    assertLessonId(params.lesson_id);
  } catch (err: any) {
    throw error(400, err?.message || 'Invalid course or lesson identifier');
  }

  const bundle = CourseService.getLessonContent(params.course_id, params.lesson_id);
  if (!bundle) {
    throw error(404, `Lesson ${params.lesson_id} not found in ${params.course_id}`);
  }
  return json(bundle);
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const { tab, content, asNewVersion } = body;

  try {
    assertCourseId(params.course_id);
    assertLessonId(params.lesson_id);
    assertTab(tab);
  } catch (err: any) {
    throw error(400, err?.message || 'Invalid identifier');
  }

  if (typeof content !== 'string') {
    throw error(400, 'Invalid request: content string required');
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
