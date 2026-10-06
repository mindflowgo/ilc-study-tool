import fs from 'node:fs';
import path from 'node:path';
import { getLlmConfigPath } from './paths';

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
      const p = getLlmConfigPath();
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
      const p = getLlmConfigPath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const existing = LLMService.loadStoredConfig();
      const apiKey = (config.apiKey && config.apiKey.trim())
        ? config.apiKey.trim()
        : (existing?.apiKey || '');
      const cleanConfig: LLMConfig = {
        ...config,
        apiKey,
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

    // Use passed key or fallback to stored key
    const rawKey = (config.apiKey && config.apiKey.trim()) || LLMService.loadStoredConfig()?.apiKey || '';
    if (rawKey.trim()) {
      const trimmedKey = rawKey.trim();
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

    const authHeaderDisplay = headers['Authorization']
      ? `Bearer ${headers['Authorization'].slice(7, 11)}***`
      : (headers['api-key'] ? 'api-key: ***' : 'None');

    const isDebug = process.env.DEBUG_LLM === 'true' || process.env.NODE_ENV === 'development';
    if (isDebug) {
      const systemPreview = systemPrompt.length > 200 ? systemPrompt.slice(0, 200) + '...' : systemPrompt;
      const userPreview = userPrompt.length > 200 ? userPrompt.slice(0, 200) + '...' : userPrompt;
      console.log('\n=================== [LLM API Request] ===================');
      console.log(`Endpoint:    ${primaryUrl}`);
      console.log(`Session ID:  ${payload.session_id || 'none'}`);
      console.log(`Model:       ${payload.model || '(server default)'}`);
      console.log(`Auth Header: ${authHeaderDisplay}`);
      console.log(`System Prompt Preview:\n${systemPreview}`);
      console.log(`\nUser Prompt Length: ${userPrompt.length.toLocaleString()} chars (~${Math.round(userPrompt.length / 4).toLocaleString()} tokens)`);
      console.log(`User Prompt Preview:\n${userPreview}`);
      console.log('=========================================================\n');
    } else {
      console.log(`[LLM API Request] Model: ${payload.model || 'default'} | Endpoint: ${primaryUrl} (~${Math.round(userPrompt.length / 4)} tokens)`);
    }

    const fetchWithRetry = async (url: string, bodyJson: string, maxRetries = 2): Promise<Response> => {
      let attempt = 0;
      while (true) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(new Error('LLM request timed out after 90s')), 90000);
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: bodyJson,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if ((response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) && attempt < maxRetries) {
            attempt++;
            let waitMs = attempt * 1500;
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter) {
              const parsed = parseInt(retryAfter, 10);
              if (!isNaN(parsed) && parsed > 0 && parsed <= 30) {
                waitMs = parsed * 1000;
              }
            }
            console.warn(`[LLM API] HTTP ${response.status} from ${url}. Retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }

          return response;
        } catch (err: any) {
          if (attempt < maxRetries) {
            attempt++;
            const waitMs = attempt * 1500;
            console.warn(`[LLM API] Network error (${err?.message || err}). Retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          throw err;
        }
      }
    };

    const bodyJson = JSON.stringify(payload);
    let res = await fetchWithRetry(primaryUrl, bodyJson);

    // Fallback: If 404 and primary had appended /v1/chat/completions, try direct /chat/completions
    if (res.status === 404 && !config.baseUrl.includes('/v1')) {
      const cleanBase = config.baseUrl.trim().replace(/\/+$/, '');
      const fallbackUrl = `${cleanBase}/chat/completions`;
      if (fallbackUrl !== primaryUrl) {
        console.warn(`[LLM API] Primary URL returned 404, attempting fallback URL: ${fallbackUrl}`);
        const fallbackRes = await fetchWithRetry(fallbackUrl, bodyJson);
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
