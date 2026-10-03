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
      const result = await LLMService.generateResult(config as LLMConfig, systemPrompt, userPrompt);
      return json({ success: true, completion: result.completion, usage: result.usage });
    } catch (err: any) {
      throw error(500, err?.message || 'LLM generation failed');
    }
  }

  throw error(400, `Unknown action: ${action}`);
};
