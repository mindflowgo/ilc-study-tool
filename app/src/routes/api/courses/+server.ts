import { json } from '@sveltejs/kit';
import { CourseService } from '$lib/server/courses';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const courses = CourseService.listCourses();
  return json({ courses });
};
