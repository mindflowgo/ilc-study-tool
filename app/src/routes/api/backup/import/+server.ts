import { json, error } from '@sveltejs/kit';
import { restoreDataBackupZip } from '$lib/server/backup';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw error(400, 'A .zip backup file is required');
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      throw error(400, 'Invalid file format. Please upload a .zip file.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = restoreDataBackupZip(buffer);

    return json({
      message: `Successfully restored ${result.coursesRestored} courses and ${result.filesRestored} files.`,
      ...result
    });
  } catch (err: any) {
    console.error('[Backup Import Error]', err);
    throw error(err.status || 500, err?.message || 'Failed to restore backup archive');
  }
};
