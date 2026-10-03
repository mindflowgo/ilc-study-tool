import { json, error } from '@sveltejs/kit';
import { PromptService } from '$lib/server/prompts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const prompts = PromptService.listPrompts();
  return json({ prompts });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { id, content } = body;

  if (!id || typeof content !== 'string') {
    throw error(400, 'Invalid request: id and content required');
  }

  const success = PromptService.savePrompt(id, content);
  if (!success) {
    throw error(500, 'Failed to save prompt');
  }

  return json({ success: true });
};
