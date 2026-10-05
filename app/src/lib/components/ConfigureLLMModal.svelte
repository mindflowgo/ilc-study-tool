<script lang="ts">
  import { X, Server, Sparkles, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfigured: () => void;
  }

  let { isOpen, onClose, onConfigured }: Props = $props();

  let provider = $state('openai_compatible');
  let baseUrl = $state('http://localhost:11434/v1');
  let apiKey = $state('');
  let authHeaderType: 'bearer' | 'api_key' | 'both' = $state('bearer');
  let model = $state('');
  let temperature = $state(0.3);

  let isTesting = $state(false);
  let statusMessage = $state<{ success: boolean; text: string } | null>(null);

  $effect(() => {
    if (isOpen && typeof localStorage !== 'undefined') {
      provider = localStorage.getItem('ilc_llm_provider') || 'openai_compatible';
      baseUrl = localStorage.getItem('ilc_llm_baseUrl') || 'http://localhost:11434/v1';
      apiKey = localStorage.getItem('ilc_llm_apiKey') || '';
      authHeaderType = (localStorage.getItem('ilc_llm_authHeaderType') as any) || 'bearer';
      model = localStorage.getItem('ilc_llm_model') ?? '';
      temperature = parseFloat(localStorage.getItem('ilc_llm_temp') || '0.3');
    }
  });

  function handleSaveAndContinue() {
    const cleanModel = model.trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ilc_llm_provider', provider);
      localStorage.setItem('ilc_llm_baseUrl', baseUrl);
      localStorage.setItem('ilc_llm_apiKey', apiKey);
      localStorage.setItem('ilc_llm_authHeaderType', authHeaderType);
      localStorage.setItem('ilc_llm_model', cleanModel);
      localStorage.setItem('ilc_llm_temp', temperature.toString());
    }

    // Sync to server immediately so background worker uses CURRENT active settings
    fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_config',
        config: {
          provider,
          baseUrl,
          apiKey,
          authHeaderType,
          model: cleanModel,
          temperature
        }
      })
    }).catch((err) => console.warn('Failed to sync LLM config to server:', err));

    onConfigured();
    onClose();
  }

  async function testConnection() {
    isTesting = true;
    statusMessage = null;

    try {
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          config: {
            provider,
            baseUrl,
            apiKey,
            authHeaderType,
            model,
            temperature
          }
        })
      });

      const data = await res.json();
      statusMessage = {
        success: data.success,
        text: data.message || (data.success ? 'Connected successfully!' : 'Connection failed')
      };
    } catch (err: any) {
      statusMessage = {
        success: false,
        text: err?.message || 'Failed to contact LLM endpoint'
      };
    } finally {
      isTesting = false;
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
    <div class="w-full max-w-lg rounded-2xl bg-white border border-stone-200 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-stone-100">
        <div class="flex items-center space-x-2.5">
          <div class="p-2 rounded-xl bg-stone-900 text-white shadow-2xs">
            <Server class="w-4 h-4" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-stone-900">Setup AI / LLM Connection</h2>
            <p class="text-[11px] text-stone-500">Configure an LLM to generate summaries, cheatsheets, and tests</p>
          </div>
        </div>

        <button
          onclick={onClose}
          class="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Provider Form -->
      <div class="space-y-3.5">
        <div class="space-y-1">
          <label for="modal-provider" class="text-xs font-medium text-stone-700">Provider</label>
          <select
            id="modal-provider"
            bind:value={provider}
            class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 bg-white focus:outline-none focus:ring-1 focus:ring-stone-900"
          >
            <option value="openai_compatible">OpenAI-Compatible (Ollama, vLLM, LMStudio, OpenRouter, Local)</option>
            <option value="gemini">Google Gemini (OpenAI compatibility endpoint)</option>
            <option value="ollama">Ollama Local</option>
          </select>
        </div>

        <div class="space-y-1">
          <label for="modal-base-url" class="text-xs font-medium text-stone-700">Base URL</label>
          <input
            id="modal-base-url"
            type="text"
            bind:value={baseUrl}
            placeholder="http://localhost:11434/v1"
            class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
          />
          <p class="text-[10px] text-stone-400">For free local AI with Ollama, run <code>ollama run llama3</code></p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label for="modal-model-name" class="text-xs font-medium text-stone-700">Model Name (optional)</label>
            <input
              id="modal-model-name"
              type="text"
              bind:value={model}
              placeholder="e.g. gpt-4o-mini, llama3 (or blank)"
              class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </div>

          <div class="space-y-1">
            <label for="modal-api-key" class="text-xs font-medium text-stone-700">API Key (if required)</label>
            <input
              id="modal-api-key"
              type="password"
              bind:value={apiKey}
              placeholder="sk-..."
              class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </div>
        </div>

        <!-- Auth Header Option -->
        <div class="space-y-1 pt-1">
          <label for="modal-auth-type" class="text-xs font-medium text-stone-700 flex items-center justify-between">
            <span>Auth Header Format</span>
            <span class="text-[10px] text-stone-400 font-mono">Authorization: Bearer</span>
          </label>
          <select
            id="modal-auth-type"
            bind:value={authHeaderType}
            class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 bg-white focus:outline-none focus:ring-1 focus:ring-stone-900"
          >
            <option value="bearer">Authorization: Bearer &#123;key&#125; (Standard OpenAPI / OpenAI)</option>
            <option value="api_key">api-key: &#123;key&#125; (Azure / Custom OpenAPI)</option>
            <option value="both">Both (Authorization: Bearer + api-key)</option>
          </select>
        </div>
      </div>

      <!-- Test connection status -->
      {#if statusMessage}
        <div class="flex items-center space-x-2 text-xs p-3 rounded-lg border {statusMessage.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}">
          {#if statusMessage.success}
            <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600" />
          {:else}
            <AlertCircle class="w-4 h-4 shrink-0 text-rose-600" />
          {/if}
          <span>{statusMessage.text}</span>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex items-center justify-between pt-2 border-t border-stone-100">
        <button
          onclick={testConnection}
          disabled={isTesting}
          class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs text-stone-700 hover:bg-stone-50 transition"
        >
          {#if isTesting}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Testing...</span>
          {:else}
            <span>Test Connection</span>
          {/if}
        </button>

        <div class="flex items-center space-x-2">
          <button
            onclick={onClose}
            class="px-3 py-1.5 rounded-lg border border-stone-200 text-xs text-stone-700 hover:bg-stone-50 transition"
          >
            Cancel
          </button>
          <button
            onclick={handleSaveAndContinue}
            class="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium transition shadow-2xs"
          >
            <span>Save & Generate</span>
            <ArrowRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
