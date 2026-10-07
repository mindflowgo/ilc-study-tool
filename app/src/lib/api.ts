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
  // In dev (localhost:5173), Vite dev server handles /api proxying
  if (window.location.port === '5173') return '';
  // In Tauri packaged production app, point to local Bun backend
  if (isTauriEnvironment()) {
    return `http://127.0.0.1:${BACKEND_PORT}`;
  }
  return '';
}

let interceptorInitialized = false;

export function initApiInterceptor(): void {
  if (typeof window === 'undefined' || interceptorInitialized) return;
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return;

  interceptorInitialized = true;
  const originalFetch = window.fetch;
  window.fetch = (function (input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string') {
      if (input.startsWith('/api/')) {
        input = `${baseUrl}${input}`;
      }
    } else if (input instanceof URL) {
      if (input.pathname.startsWith('/api/')) {
        input = new URL(`${baseUrl}${input.pathname}${input.search}`);
      }
    }
    return originalFetch(input, init);
  }) as any;
}
