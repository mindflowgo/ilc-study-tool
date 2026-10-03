import { json, error } from '@sveltejs/kit';
import { CourseService } from '$lib/server/courses';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const course = CourseService.getCourse(params.course_id);
  if (!course) {
    throw error(404, `Course ${params.course_id} not found`);
  }
  return json({ course });
};
