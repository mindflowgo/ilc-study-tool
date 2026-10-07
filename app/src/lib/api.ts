export const BACKEND_PORT = 3182;

export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost'
  );
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  // In dev (localhost:5173), the Vite/SvelteKit dev server handles /api itself
  if (window.location.port === '5173') return '';
  // In the packaged Tauri app, point to the local Bun backend sidecar
  if (isTauriEnvironment()) {
    return `http://127.0.0.1:${BACKEND_PORT}`;
  }
  return '';
}

/**
 * Typed fetch for the backend API. Applies the correct base URL for the
 * current environment (dev server vs packaged Tauri sidecar) so call sites
 * never need environment branching — and no global fetch patching is needed.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${getApiBaseUrl()}${path}`, init);
}
