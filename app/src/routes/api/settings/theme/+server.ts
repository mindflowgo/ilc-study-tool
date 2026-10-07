import { json, error } from '@sveltejs/kit';
import { loadAppSettings, saveAppSettings } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const settings = loadAppSettings();
  const theme = settings.theme || 'system';
  return json({
    success: true,
    theme
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { theme } = body;

    if (!theme || !['light', 'dark', 'system'].includes(theme)) {
      throw error(400, 'Invalid theme. Expected "light", "dark", or "system".');
    }

    saveAppSettings({ theme });

    return json({
      success: true,
      theme,
      message: `Theme saved as ${theme}`
    });
  } catch (err: any) {
    if (err?.status) throw err;
    throw error(500, err?.message || 'Failed to save theme setting');
  }
};
