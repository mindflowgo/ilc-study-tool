<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import { onMount } from 'svelte';
  import {
    Settings,
    Server,
    FolderKanban,
    RotateCw,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Save
  } from 'lucide-svelte';

  let provider = $state('openai_compatible');
  let baseUrl = $state('http://localhost:11434/v1');
  let apiKey = $state('');
  let model = $state('llama3');
  let temperature = $state(0.3);

  let isTestingConnection = $state(false);
  let connectionTestResult: { success: boolean; message: string } | null = $state(null);

  let isReparsing = $state(false);
  let reparseResult: string = $state('');
  let saveMessage = $state('');

  function loadSettings() {
    if (typeof localStorage !== 'undefined') {
      provider = localStorage.getItem('ilc_llm_provider') || 'openai_compatible';
      baseUrl = localStorage.getItem('ilc_llm_baseUrl') || 'http://localhost:11434/v1';
      apiKey = localStorage.getItem('ilc_llm_apiKey') || '';
      model = localStorage.getItem('ilc_llm_model') || 'llama3';
      temperature = parseFloat(localStorage.getItem('ilc_llm_temp') || '0.3');
    }
  }

  function saveSettings() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ilc_llm_provider', provider);
      localStorage.setItem('ilc_llm_baseUrl', baseUrl);
      localStorage.setItem('ilc_llm_apiKey', apiKey);
      localStorage.setItem('ilc_llm_model', model);
      localStorage.setItem('ilc_llm_temp', temperature.toString());
      saveMessage = 'Settings saved to browser storage.';
      setTimeout(() => {
        saveMessage = '';
      }, 2500);
    }
  }

  async function testConnection() {
    isTestingConnection = true;
    connectionTestResult = null;

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
            model,
            temperature
          }
        })
      });

      const data = await res.json();
      connectionTestResult = {
        success: data.success,
        message: data.message || (data.success ? 'Connected successfully!' : 'Connection failed')
      };
    } catch (err: any) {
      connectionTestResult = {
        success: false,
        message: err?.message || 'Error contacting LLM endpoint'
      };
    } finally {
      isTestingConnection = false;
    }
  }

  async function reparseAllCourses() {
    isReparsing = true;
    reparseResult = '';

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (res.ok) {
        reparseResult = 'Successfully re-indexed and refreshed all course materials!';
      } else {
        reparseResult = 'Failed to re-index courses.';
      }
    } catch (err: any) {
      reparseResult = 'Error during re-indexing: ' + err?.message;
    } finally {
      isReparsing = false;
    }
  }

  onMount(() => {
    loadSettings();
  });
</script>

<Header />

<main class="flex-1 overflow-y-auto px-4 py-8 sm:px-8 max-w-4xl mx-auto w-full space-y-8">
  <div>
    <h1 class="text-2xl font-bold tracking-tight text-stone-900">Settings</h1>
    <p class="text-xs text-stone-500 mt-1">
      Manage storage directories, LLM endpoints, and course maintenance.
    </p>
  </div>

  <!-- LLM Configuration Section -->
  <section class="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs space-y-5">
    <div class="flex items-center space-x-2 pb-3 border-b border-stone-100">
      <Server class="w-4 h-4 text-stone-700" />
      <h2 class="text-sm font-semibold text-stone-900">LLM Provider Configuration</h2>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <label for="provider-select" class="text-xs font-medium text-stone-700">Provider</label>
        <select
          id="provider-select"
          bind:value={provider}
          class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 bg-white focus:outline-none focus:ring-1 focus:ring-stone-900"
        >
          <option value="openai_compatible">OpenAI-Compatible (Ollama, vLLM, LMStudio)</option>
          <option value="gemini">Google Gemini (via OpenAI compatibility endpoint)</option>
          <option value="ollama">Ollama Local</option>
        </select>
      </div>

      <div class="space-y-1.5">
        <label for="base-url-input" class="text-xs font-medium text-stone-700">Base URL</label>
        <input
          id="base-url-input"
          type="text"
          bind:value={baseUrl}
          placeholder="http://localhost:11434/v1"
          class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
        />
      </div>

      <div class="space-y-1.5">
        <label for="api-key-input" class="text-xs font-medium text-stone-700">API Key (optional for local models)</label>
        <input
          id="api-key-input"
          type="password"
          bind:value={apiKey}
          placeholder="sk-..."
          class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
        />
      </div>

      <div class="space-y-1.5">
        <label for="model-name-input" class="text-xs font-medium text-stone-700">Model Name</label>
        <input
          id="model-name-input"
          type="text"
          bind:value={model}
          placeholder="llama3, gpt-4o-mini"
          class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
        />
      </div>
    </div>

    <!-- Connection Test Status -->
    {#if connectionTestResult}
      <div class="flex items-center space-x-2 text-xs p-3 rounded-lg border {connectionTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}">
        {#if connectionTestResult.success}
          <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600" />
        {:else}
          <AlertCircle class="w-4 h-4 shrink-0 text-rose-600" />
        {/if}
        <span>{connectionTestResult.message}</span>
      </div>
    {/if}

    {#if saveMessage}
      <p class="text-xs text-emerald-600 font-medium">{saveMessage}</p>
    {/if}

    <div class="flex items-center justify-between pt-2">
      <button
        onclick={testConnection}
        disabled={isTestingConnection}
        class="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs text-stone-700 font-medium transition"
      >
        {#if isTestingConnection}
          <Loader2 class="w-3.5 h-3.5 animate-spin" />
          <span>Testing...</span>
        {:else}
          <span>Test Connection</span>
        {/if}
      </button>

      <button
        onclick={saveSettings}
        class="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 transition shadow-2xs"
      >
        <Save class="w-3.5 h-3.5" />
        <span>Save Settings</span>
      </button>
    </div>
  </section>

  <!-- Course Maintenance Section -->
  <section class="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs space-y-4">
    <div class="flex items-center space-x-2 pb-3 border-b border-stone-100">
      <FolderKanban class="w-4 h-4 text-stone-700" />
      <h2 class="text-sm font-semibold text-stone-900">Course Ingestion & Maintenance</h2>
    </div>

    <p class="text-xs text-stone-600 leading-relaxed">
      Trigger a complete re-parse of all raw SCORM HTML packages in <code>data/courses/&lt;course&gt;/_backup/</code> to update markdown lessons, refresh assets, and synchronize manifests.
    </p>

    {#if reparseResult}
      <div class="text-xs p-3 rounded-lg bg-stone-50 border border-stone-200 text-stone-800">
        {reparseResult}
      </div>
    {/if}

    <button
      onclick={reparseAllCourses}
      disabled={isReparsing}
      class="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium transition"
    >
      {#if isReparsing}
        <Loader2 class="w-3.5 h-3.5 animate-spin" />
        <span>Re-indexing Courses...</span>
      {:else}
        <RotateCw class="w-3.5 h-3.5" />
        <span>Re-parse All Courses</span>
      {/if}
    </button>
  </section>
</main>
