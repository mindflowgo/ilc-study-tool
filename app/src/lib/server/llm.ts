export interface LLMConfig {
  provider: 'openai_compatible' | 'ollama' | 'gemini';
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
}

export class LLMService {
  static async generate(config: LLMConfig, systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const payload = {
      model: config.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: config.temperature ?? 0.3
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  static async testConnection(config: LLMConfig): Promise<{ success: boolean; message: string }> {
    try {
      const testRes = await this.generate(config, 'You are a test assistant.', 'Reply with "OK"');
      if (testRes.toLowerCase().includes('ok')) {
        return { success: true, message: 'Connection successful!' };
      }
      return { success: true, message: `Connected, received response: ${testRes.slice(0, 50)}...` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Connection failed' };
    }
  }
}
