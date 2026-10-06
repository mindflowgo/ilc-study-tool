import { json, error } from '@sveltejs/kit';
import { getDataStorageInfo, setCustomDataDir } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json(getDataStorageInfo());
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { dataDir, migrate } = body;
    const result = setCustomDataDir(dataDir, Boolean(migrate));
    const storageInfo = getDataStorageInfo();
    return json({
      success: true,
      ...storageInfo,
      migratedFiles: result.migratedFiles
    });
  } catch (err: any) {
    throw error(400, err?.message || 'Failed to update data directory');
  }
};
