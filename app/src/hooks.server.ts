import type { Handle } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { PathValidationError } from '$lib/server/paths';

/**
 * Maps identifier/path validation failures onto a 400 instead of a 500.
 *
 * The service layer throws `PathValidationError` so that it is safe no matter
 * which caller reaches it; this hook turns that into a proper client error for
 * the SvelteKit routes. The standalone sidecar server applies the same
 * mapping itself.
 */
export const handle: Handle = async ({ event, resolve }) => {
  try {
    return await resolve(event);
  } catch (err) {
    if (err instanceof PathValidationError) {
      return json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
};