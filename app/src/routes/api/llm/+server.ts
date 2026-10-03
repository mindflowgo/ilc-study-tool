import { json, error } from '@sveltejs/kit';
import { LLMService, type LLMConfig } from '$lib/server/llm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { action, config, systemPrompt, userPrompt, sessionId } = body;

  if (!config) {
    throw error(400, 'LLM config is required');
  }

  if (sessionId && !config.sessionId) {
    config.sessionId = sessionId;
  }

  if (action === 'test') {
    const result = await LLMService.testConnection(config as LLMConfig);
    return json(result);
  }

  if (action === 'generate') {
    if (!systemPrompt || !userPrompt) {
      throw error(400, 'systemPrompt and userPrompt are required for generation');
    }
    try {
      const completion = await LLMService.generate(config as LLMConfig, systemPrompt, userPrompt);
      return json({ success: true, completion });
    } catch (err: any) {
      throw error(500, err?.message || 'LLM generation failed');
    }
  }

  throw error(400, `Unknown action: ${action}`);
};
