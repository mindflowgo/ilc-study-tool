export interface LLMConfig {
  provider: 'openai_compatible' | 'ollama' | 'gemini';
  baseUrl: string;
  apiKey?: string;
  authHeaderType?: 'bearer' | 'api_key' | 'both';
  model?: string;
  temperature?: number;
  sessionId?: string;
}

export function resolveCompletionsUrl(baseUrl: string): string {
  if (!baseUrl) return '';
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  if (clean.endsWith('/v1')) {
    return `${clean}/chat/completions`;
  }
  return `${clean}/v1/chat/completions`;
}

export class LLMService {
  static async generate(config: LLMConfig, systemPrompt: string, userPrompt: string): Promise<string> {
    const primaryUrl = resolveCompletionsUrl(config.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (config.apiKey && config.apiKey.trim()) {
      const trimmedKey = config.apiKey.trim();
      const cleanKey = trimmedKey.replace(/^bearer\s+/i, '');
      const authType = config.authHeaderType || 'bearer';

      if (authType === 'bearer' || authType === 'both') {
        headers['Authorization'] = `Bearer ${cleanKey}`;
      }
      if (authType === 'api_key' || authType === 'both') {
        headers['api-key'] = cleanKey;
        headers['x-api-key'] = cleanKey;
      }
    }

    const payload: Record<string, any> = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    if (config.model && config.model.trim()) {
      payload.model = config.model.trim();
    }

    if (config.temperature !== undefined) {
      payload.temperature = config.temperature;
    }

    if (config.sessionId && config.sessionId.trim()) {
      payload.session_id = config.sessionId.trim();
    }

    let res = await fetch(primaryUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    // Fallback: If 404 and primary had appended /v1/chat/completions, try direct /chat/completions
    if (res.status === 404 && !config.baseUrl.includes('/v1')) {
      const cleanBase = config.baseUrl.trim().replace(/\/+$/, '');
      const fallbackUrl = `${cleanBase}/chat/completions`;
      if (fallbackUrl !== primaryUrl) {
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        if (fallbackRes.ok) {
          res = fallbackRes;
        }
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  static async testConnection(config: LLMConfig): Promise<{ success: boolean; message: string }> {
    try {
      const testConfig = {
        ...config,
        sessionId: config.sessionId || 'test-session'
      };
      const testRes = await this.generate(testConfig, 'You are a test assistant.', 'Reply with "OK"');
      if (testRes.toLowerCase().includes('ok')) {
        return { success: true, message: 'Connection successful!' };
      }
      return { success: true, message: `Connected, received response: ${testRes.slice(0, 50)}...` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Connection failed' };
    }
  }
}
