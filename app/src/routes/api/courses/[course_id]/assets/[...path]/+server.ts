import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { CourseService } from '$lib/server/courses';
import type { RequestHandler } from './$types';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.css': 'text/css',
  '.js': 'application/javascript'
};

export const GET: RequestHandler = async ({ params }) => {
  const filePath = CourseService.resolveAssetPath(params.course_id, params.path);
  if (!filePath || !fs.existsSync(filePath)) {
    throw error(404, 'Asset not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(filePath);

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
