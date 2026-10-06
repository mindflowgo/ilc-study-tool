import { json, error } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { getDataDir } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const platform = process.platform;
  const binary = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open';

  execFile(binary, [dataDir], (err) => {
    if (err) console.error(`Failed to open data directory '${dataDir}':`, err);
  });

  return json({ success: true, message: `Opened ${dataDir}`, path: dataDir });
};
