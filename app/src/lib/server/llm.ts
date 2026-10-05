import fs from 'node:fs';
import path from 'node:path';

function getDataDir(): string {
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    return process.env.DATA_DIR;
  }
  const candidate1 = path.resolve(process.cwd(), 'data');
  if (fs.existsSync(candidate1)) return candidate1;
  const candidate2 = path.resolve(process.cwd(), '..', 'data');
  if (fs.existsSync(candidate2)) return candidate2;
  return path.resolve(process.cwd(), 'data');
}

function getStoredConfigPath(): string {
  return path.join(getDataDir(), 'llm_config.json');
}

export interface LLMConfig {
  provider: 'openai_compatible' | 'ollama' | 'gemini';
  baseUrl: string;
  apiKey?: string;
  authHeaderType?: 'bearer' | 'api_key' | 'both';
  model?: string;
  temperature?: number;
  sessionId?: string;
}

export interface LLMResult {
  completion: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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
  static loadStoredConfig(): LLMConfig | null {
    try {
      const p = getStoredConfigPath();
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (e) {
      console.warn('Failed to load stored LLM config:', e);
    }
    return null;
  }

  static saveStoredConfig(config: LLMConfig): void {
    try {
      const p = getStoredConfigPath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const cleanConfig: LLMConfig = {
        ...config,
        model: config.model ? config.model.trim() : ''
      };
      fs.writeFileSync(p, JSON.stringify(cleanConfig, null, 2), 'utf8');
      console.log(`[LLM Config Saved] Base URL: ${cleanConfig.baseUrl}, Model: ${cleanConfig.model || '(server default)'}`);
    } catch (e) {
      console.warn('Failed to save stored LLM config:', e);
    }
  }
  static async generateResult(config: LLMConfig, systemPrompt: string, userPrompt: string): Promise<LLMResult> {
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

    // Diagnostic console logging
    const systemPreview = systemPrompt.length > 250 ? systemPrompt.slice(0, 250) + '...' : systemPrompt;
    const userPreview = userPrompt.length > 250 ? userPrompt.slice(0, 250) + '...' : userPrompt;
    const authHeaderDisplay = headers['Authorization']
      ? `Bearer ${headers['Authorization'].slice(7, 11)}***`
      : (headers['api-key'] ? 'api-key: ***' : 'None');

    console.log('\n=================== [LLM API Request] ===================');
    console.log(`Endpoint:    ${primaryUrl}`);
    console.log(`Session ID:  ${payload.session_id || 'none'}`);
    console.log(`Model:       ${payload.model || '(server default)'}`);
    console.log(`Auth Header: ${authHeaderDisplay}`);
    console.log(`System Prompt Preview:\n${systemPreview}`);
    console.log(`\nUser Prompt Length: ${userPrompt.length.toLocaleString()} chars (~${Math.round(userPrompt.length / 4).toLocaleString()} tokens)`);
    console.log(`User Prompt Preview:\n${userPreview}`);
    console.log('=========================================================\n');

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
        console.warn(`[LLM API] Primary URL returned 404, attempting fallback URL: ${fallbackUrl}`);
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

    console.log(`[LLM API Response] Status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[LLM API Error Body] ${errText}`);
      throw new Error(`LLM Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const completion = data.choices?.[0]?.message?.content || '';
    const usage = data.usage;
    const tokensInfo = usage?.total_tokens !== undefined
      ? ` | "total_tokens":${usage.total_tokens} (prompt: ${usage.prompt_tokens ?? '?'}, completion: ${usage.completion_tokens ?? '?'})`
      : (usage ? ` | usage: ${JSON.stringify(usage)}` : '');

    console.log(`[LLM API Success] Generated ${completion.length.toLocaleString()} characters${tokensInfo}.\n`);

    return { completion, usage };
  }

  static async generate(config: LLMConfig, systemPrompt: string, userPrompt: string): Promise<string> {
    const result = await this.generateResult(config, systemPrompt, userPrompt);
    return result.completion;
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
