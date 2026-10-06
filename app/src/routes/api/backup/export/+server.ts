import { error } from '@sveltejs/kit';
import { createDataBackupZip } from '$lib/server/backup';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const { buffer, filename } = createDataBackupZip();

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err: any) {
    console.error('[Backup Export Error]', err);
    throw error(500, err?.message || 'Failed to generate backup archive');
  }
};
