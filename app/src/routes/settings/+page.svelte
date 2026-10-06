<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import { onMount } from 'svelte';
  import { isTauriEnvironment } from '$lib/api';
  import {
    Settings,
    Server,
    FolderKanban,
    RotateCw,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Save,
    ImageDown,
    HardDrive,
    FolderOpen,
    Folder,
    Download,
    Upload,
    Archive
  } from 'lucide-svelte';

  // Storage state
  interface StorageInfo {
    dataDir: string;
    defaultDataDir: string;
    isCustom: boolean;
    courseCount: number;
    totalSize: number;
    totalSizeFormatted: string;
  }

  let storageInfo: StorageInfo | null = $state(null);
  let isLoadingStorage = $state(false);
  let isChangingPath = $state(false);
  let isSavingPath = $state(false);
  let newPath = $state('');
  let migrateExisting = $state(true);
  let storageMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // Backup state
  let isExportingBackup = $state(false);
  let isImportingBackup = $state(false);
  let backupFileInput: HTMLInputElement | null = $state(null);
  let backupMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  let provider = $state('openai_compatible');
  let baseUrl = $state('http://localhost:11434/v1');
  let apiKey = $state('');
  let authHeaderType: 'bearer' | 'api_key' | 'both' = $state('bearer');
  let model = $state('');
  let temperature = $state(0.3);

  let isTestingConnection = $state(false);
  let connectionTestResult: { success: boolean; message: string } | null = $state(null);

  let isReparsing = $state(false);
  let reparseResult: string = $state('');
  let saveMessage = $state('');
  let hasStoredApiKey = $state(false);

  let isCompressingImages = $state(false);
  let compressImagesResult: string = $state('');

  function loadSettings() {
    // Clean up any legacy API key from localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('ilc_llm_apiKey');
    }

    // Load canonical config from server
    fetch('/api/llm')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.config) {
          provider = data.config.provider || 'openai_compatible';
          baseUrl = data.config.baseUrl || 'http://localhost:11434/v1';
          model = data.config.model ?? '';
          authHeaderType = data.config.authHeaderType || 'bearer';
          temperature = data.config.temperature ?? 0.3;
          hasStoredApiKey = Boolean(data.config.hasApiKey);
        } else if (typeof localStorage !== 'undefined') {
          provider = localStorage.getItem('ilc_llm_provider') || 'openai_compatible';
          baseUrl = localStorage.getItem('ilc_llm_baseUrl') || 'http://localhost:11434/v1';
          authHeaderType = (localStorage.getItem('ilc_llm_authHeaderType') as any) || 'bearer';
          model = localStorage.getItem('ilc_llm_model') ?? '';
          temperature = parseFloat(localStorage.getItem('ilc_llm_temp') || '0.3');
        }
      })
      .catch(() => {});
  }

  function saveSettings() {
    const cleanModel = model.trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ilc_llm_provider', provider);
      localStorage.setItem('ilc_llm_baseUrl', baseUrl);
      localStorage.removeItem('ilc_llm_apiKey');
      localStorage.setItem('ilc_llm_authHeaderType', authHeaderType);
      localStorage.setItem('ilc_llm_model', cleanModel);
      localStorage.setItem('ilc_llm_temp', temperature.toString());
      saveMessage = 'Settings saved.';
      setTimeout(() => {
        saveMessage = '';
      }, 2500);
    }

    // Sync to server immediately so background queue worker uses CURRENT active settings
    fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_config',
        config: {
          provider,
          baseUrl,
          apiKey: apiKey || undefined,
          authHeaderType,
          model: cleanModel,
          temperature
        }
      })
    })
      .then(() => {
        if (apiKey) {
          hasStoredApiKey = true;
          apiKey = '';
        }
      })
      .catch((err) => console.warn('Failed to sync LLM config to server:', err));
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
            authHeaderType,
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

  async function compressCourseImages() {
    isCompressingImages = true;
    compressImagesResult = '';

    try {
      const res = await fetch('/api/maintenance/compress-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (res.ok) {
        const data = await res.json();
        const { converted, bytesBefore, bytesAfter } = data.totals ?? {};
        const mb = (n: number) => `${(Number(n || 0) / 1048576).toFixed(1)}MB`;
        if (converted > 0) {
          compressImagesResult = `Compressed ${converted} image(s): ${mb(bytesBefore)} → ${mb(bytesAfter)} across ${data.results?.length ?? 0} course(s).`;
        } else {
          compressImagesResult = 'All course images are already optimized — nothing to compress.';
        }
      } else {
        compressImagesResult = 'Failed to compress course images.';
      }
    } catch (err: any) {
      compressImagesResult = 'Error during compression: ' + err?.message;
    } finally {
      isCompressingImages = false;
    }
  }

  async function loadStorageInfo() {
    isLoadingStorage = true;
    try {
      const res = await fetch('/api/settings/storage');
      if (res.ok) {
        storageInfo = await res.json();
      }
    } catch (err: any) {
      console.warn('Failed to load storage info:', err);
    } finally {
      isLoadingStorage = false;
    }
  }

  async function openFolder() {
    try {
      const res = await fetch('/api/settings/open-folder', { method: 'POST' });
      if (!res.ok) {
        storageMessage = { type: 'error', text: 'Failed to open data folder.' };
      }
    } catch (err: any) {
      storageMessage = { type: 'error', text: 'Error opening folder: ' + (err?.message || '') };
    }
  }

  async function chooseFolder() {
    if (isTauriEnvironment()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select Course Data Folder',
          defaultPath: newPath || storageInfo?.dataDir
        });
        if (selected && typeof selected === 'string') {
          newPath = selected;
          isChangingPath = true;
        }
      } catch (err: any) {
        console.warn('Tauri directory picker error:', err);
        isChangingPath = true;
      }
    } else {
      isChangingPath = true;
      if (!newPath && storageInfo) {
        newPath = storageInfo.dataDir;
      }
    }
  }

  async function saveNewPath(targetPath?: string) {
    const pathToSet = targetPath !== undefined ? targetPath : newPath.trim();
    isSavingPath = true;
    storageMessage = null;

    try {
      const res = await fetch('/api/settings/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataDir: pathToSet,
          migrate: migrateExisting
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to update storage directory');
      }

      storageInfo = {
        dataDir: data.dataDir,
        defaultDataDir: data.defaultDataDir,
        isCustom: data.isCustom,
        courseCount: data.courseCount,
        totalSize: data.totalSize,
        totalSizeFormatted: data.totalSizeFormatted
      };
      isChangingPath = false;
      newPath = '';
      storageMessage = {
        type: 'success',
        text: pathToSet
          ? `Storage location updated! ${data.migratedFiles ? `Copied ${data.migratedFiles} items to new location.` : ''}`
          : 'Storage location reset to default system directory.'
      };
    } catch (err: any) {
      storageMessage = {
        type: 'error',
        text: err?.message || 'Error updating data directory'
      };
    } finally {
      isSavingPath = false;
    }
  }

  function resetStorageToDefault() {
    if (confirm('Reset course data location back to the default system folder?')) {
      saveNewPath('');
    }
  }

  async function exportBackup() {
    isExportingBackup = true;
    backupMessage = null;

    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const filename = `ilc-study-tool-backup-${new Date().toISOString().split('T')[0]}.zip`;

      // If in Tauri desktop app, use native save dialog
      if (isTauriEnvironment()) {
        try {
          const [{ save }, { invoke }] = await Promise.all([
            import('@tauri-apps/plugin-dialog'),
            import('@tauri-apps/api/core')
          ]);
          const savePath = await save({
            defaultPath: filename,
            filters: [{ name: 'Zip Archive', extensions: ['zip'] }]
          });

          if (!savePath) {
            // User cancelled
            return;
          }

          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          const dataB64 = btoa(binary);

          await invoke('save_pdf_file', { path: savePath, dataB64 });
          backupMessage = {
            type: 'success',
            text: `Backup successfully saved to ${savePath}`
          };
          return;
        } catch (tauriErr) {
          console.warn('Native save dialog failed, using browser download:', tauriErr);
        }
      }

      // Browser fallback download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      backupMessage = {
        type: 'success',
        text: `Backup exported successfully: ${filename}`
      };
    } catch (err: any) {
      backupMessage = {
        type: 'error',
        text: 'Backup export failed: ' + (err?.message || 'Unknown error')
      };
    } finally {
      isExportingBackup = false;
    }
  }

  function triggerImportDialog() {
    if (backupFileInput) {
      backupFileInput.click();
    }
  }

  async function handleBackupFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    if (!confirm(`Restore course data from "${file.name}"?\n\nThis will extract courses and prompts into your active data directory.`)) {
      input.value = '';
      return;
    }

    isImportingBackup = true;
    backupMessage = null;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/backup/import', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to restore backup');
      }

      backupMessage = {
        type: 'success',
        text: `Backup restored! ${data.message || ''}`
      };

      // Refresh storage metrics
      loadStorageInfo();
    } catch (err: any) {
      backupMessage = {
        type: 'error',
        text: 'Restore failed: ' + (err?.message || 'Unknown error')
      };
    } finally {
      isImportingBackup = false;
      if (input) {
        input.value = '';
      }
    }
  }

  onMount(() => {
    loadSettings();
    loadStorageInfo();
  });
</script>

<Header />

<main class="flex-1 overflow-y-auto px-4 py-8 sm:px-8 max-w-4xl mx-auto w-full space-y-8">
  <div>
    <h1 class="text-2xl font-bold tracking-tight text-stone-900">Settings</h1>
    <p class="text-xs text-stone-500 mt-1">
      Manage course location & LLM tool.
    </p>
  </div>

  <!-- Course Data Storage & Backup Section -->
  <section class="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs space-y-6">
    <div class="flex items-center justify-between pb-3 border-b border-stone-100">
      <div class="flex items-center space-x-2">
        <HardDrive class="w-4 h-4 text-stone-700" />
        <h2 class="text-sm font-semibold text-stone-900">Course Data Configuration</h2>
      </div>
      {#if storageInfo}
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium {storageInfo.isCustom ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
          {storageInfo.isCustom ? 'Custom Location' : 'Default OS Location'}
        </span>
      {/if}
    </div>

    <p class="text-xs text-stone-600 leading-relaxed">
      Local folder where downloaded courses, lesson markdown, prompts, tests, and configurations are stored.
    </p>

    <!-- Active Path Display -->
    <div class="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
      <div class="flex items-center justify-between text-xs text-stone-500">
        <span class="font-medium text-stone-700">Active Path</span>
        {#if storageInfo}
          <span class="text-stone-500">
            {storageInfo.courseCount} {storageInfo.courseCount === 1 ? 'course' : 'courses'} &bull; {storageInfo.totalSizeFormatted}
          </span>
        {/if}
      </div>
      <div class="font-mono text-xs text-stone-800 break-all select-all bg-white p-2.5 rounded-lg border border-stone-200 shadow-2xs">
        {storageInfo?.dataDir || 'Loading...'}
      </div>
    </div>

    {#if storageMessage}
      <div class="flex items-center space-x-2 text-xs p-3 rounded-lg border {storageMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}">
        {#if storageMessage.type === 'success'}
          <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600" />
        {:else}
          <AlertCircle class="w-4 h-4 shrink-0 text-rose-600" />
        {/if}
        <span>{storageMessage.text}</span>
      </div>
    {/if}

    <!-- Change Directory Form (when editing) -->
    {#if isChangingPath}
      <div class="p-4 rounded-xl border border-stone-200 bg-stone-50/60 space-y-3.5">
        <label for="new-path-input" class="text-xs font-semibold text-stone-800 block">
          Choose New Data Directory
        </label>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            id="new-path-input"
            type="text"
            bind:value={newPath}
            placeholder={storageInfo?.dataDir || '/path/to/data'}
            class="flex-1 px-3 py-2 rounded-lg border border-stone-200 text-xs font-mono text-stone-900 bg-white placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
          />
          <button
            onclick={chooseFolder}
            type="button"
            class="flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-medium text-stone-700 transition"
          >
            <Folder class="w-3.5 h-3.5" />
            <span>Browse...</span>
          </button>
        </div>

        <div class="flex items-center space-x-2 pt-1">
          <input
            id="migrate-data-checkbox"
            type="checkbox"
            bind:checked={migrateExisting}
            class="rounded border-stone-300 text-stone-900 focus:ring-stone-900 h-3.5 w-3.5"
          />
          <label for="migrate-data-checkbox" class="text-xs text-stone-700 select-none">
            Copy existing course data, prompts, and settings to the new location
          </label>
        </div>

        <div class="flex items-center justify-end space-x-2 pt-2">
          <button
            onclick={() => { isChangingPath = false; newPath = ''; }}
            disabled={isSavingPath}
            class="px-3.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-medium text-stone-700 transition"
          >
            Cancel
          </button>
          <button
            onclick={() => saveNewPath()}
            disabled={isSavingPath || !newPath.trim()}
            class="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 disabled:opacity-50 transition shadow-2xs"
          >
            {#if isSavingPath}
              <Loader2 class="w-3.5 h-3.5 animate-spin" />
              <span>Updating...</span>
            {:else}
              <Save class="w-3.5 h-3.5" />
              <span>Apply Location</span>
            {/if}
          </button>
        </div>
      </div>
    {/if}

    <!-- Action Bar -->
    <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
      <div class="flex items-center space-x-2">
        <button
          onclick={openFolder}
          type="button"
          class="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs text-stone-700 font-medium transition"
          title="Open directory in Finder, File Explorer, or File Manager"
        >
          <FolderOpen class="w-3.5 h-3.5" />
          <span>Open Folder</span>
        </button>

        {#if !isChangingPath}
          <button
            onclick={chooseFolder}
            type="button"
            class="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs text-stone-700 font-medium transition"
          >
            <Folder class="w-3.5 h-3.5" />
            <span>Change Location</span>
          </button>
        {/if}
      </div>

      {#if storageInfo?.isCustom}
        <button
          onclick={resetStorageToDefault}
          type="button"
          class="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition"
        >
          <RotateCw class="w-3.5 h-3.5" />
          <span>Reset to Default</span>
        </button>
      {/if}
    </div>

    <!-- Backup & Migration Section within same card -->
    <div class="border-t border-stone-100 pt-5 space-y-4">

    {#if backupMessage}
      <div class="flex items-center space-x-2 text-xs p-3 rounded-lg border {backupMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}">
        {#if backupMessage.type === 'success'}
          <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600" />
        {:else}
          <AlertCircle class="w-4 h-4 shrink-0 text-rose-600" />
        {/if}
        <span>{backupMessage.text}</span>
      </div>
    {/if}

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
      <!-- Export Box -->
      <div class="p-4 rounded-xl border border-stone-200 bg-stone-50/50 flex flex-col justify-between space-y-3">
        <div class="space-y-1">
          <h3 class="text-xs font-semibold text-stone-900 flex items-center space-x-1.5">
            <Download class="w-3.5 h-3.5 text-stone-700" />
            <span>Export Course Backup</span>
          </h3>
          <p class="text-[11px] text-stone-500 leading-relaxed">
            Zip all courses, lessons, prompts, and configurations into a zip.
          </p>
        </div>

        <button
          onclick={exportBackup}
          disabled={isExportingBackup}
          class="flex items-center justify-center space-x-1.5 w-full px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 disabled:opacity-50 transition shadow-2xs"
        >
          {#if isExportingBackup}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Creating Archive...</span>
          {:else}
            <Download class="w-3.5 h-3.5" />
            <span>Export Data (.zip)</span>
          {/if}
        </button>
      </div>

      <!-- Import Box -->
      <div class="p-4 rounded-xl border border-stone-200 bg-stone-50/50 flex flex-col justify-between space-y-3">
        <div class="space-y-1">
          <h3 class="text-xs font-semibold text-stone-900 flex items-center space-x-1.5">
            <Upload class="w-3.5 h-3.5 text-stone-700" />
            <span>Restore Course Archive</span>
          </h3>
          <p class="text-[11px] text-stone-500 leading-relaxed">
            Unzip and import a saved backup directly into your active data directory.
          </p>
        </div>

        <!-- Hidden input for file selection -->
        <input
          type="file"
          accept=".zip,application/zip"
          bind:this={backupFileInput}
          onchange={handleBackupFileSelected}
          class="hidden"
        />

        <button
          onclick={triggerImportDialog}
          disabled={isImportingBackup}
          class="flex items-center justify-center space-x-1.5 w-full px-4 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs font-medium disabled:opacity-50 transition"
        >
          {#if isImportingBackup}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Restoring Data...</span>
          {:else}
            <Upload class="w-3.5 h-3.5" />
            <span>Restore from Backup (.zip)</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
</section>

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
          placeholder={hasStoredApiKey ? 'Key saved on server (leave blank to keep)' : 'sk-...'}
          class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
        />
      </div>

      <div class="space-y-1.5">
        <label for="auth-type-select" class="text-xs font-medium text-stone-700 flex items-center justify-between">
          <span>Auth Header Format</span>
          <span class="text-[10px] text-stone-400 font-mono">Authorization: Bearer</span>
        </label>
        <select
          id="auth-type-select"
          bind:value={authHeaderType}
          class="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-900 bg-white focus:outline-none focus:ring-1 focus:ring-stone-900"
        >
          <option value="bearer">Authorization: Bearer &#123;key&#125; (Standard OpenAI / OpenRouter)</option>
          <option value="api_key">api-key: &#123;key&#125; (Azure / Custom OpenAPI)</option>
          <option value="both">Both (Authorization: Bearer + api-key)</option>
        </select>
      </div>

      <div class="space-y-1.5">
        <label for="model-name-input" class="text-xs font-medium text-stone-700">Model Name (optional)</label>
        <input
          id="model-name-input"
          type="text"
          bind:value={model}
          placeholder="e.g. gpt-4o-mini, llama3 (or blank if server default)"
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
      <h2 class="text-sm font-semibold text-stone-900">Course Corruption & Image Compacting</h2>
    </div>

    <p class="text-xs text-stone-600 leading-relaxed">
      Normally these are NOT needed. Only do if course markdowns got corrupted. Trigger a complete re-parse of all raw course HTML packages in <code>data/courses/&lt;course&gt;/_backup/</code> to update markdown lessons, refresh assets, and synchronize manifests.
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

    <div class="flex items-center justify-between gap-3 pt-2 border-t border-stone-100">
      <p class="text-xs text-stone-600 leading-relaxed">
        Compress oversized course images: anything wider than 512px is resized to 512px and converted
        to JPEG; oversized markdown images get a 50% width spec.
      </p>
      <button
        onclick={compressCourseImages}
        disabled={isCompressingImages}
        class="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium transition shrink-0"
      >
        {#if isCompressingImages}
          <Loader2 class="w-3.5 h-3.5 animate-spin" />
          <span>Compressing...</span>
        {:else}
          <ImageDown class="w-3.5 h-3.5" />
          <span>Compress Course Images</span>
        {/if}
      </button>
    </div>

    {#if compressImagesResult}
      <div class="text-xs p-3 rounded-lg bg-stone-50 border border-stone-200 text-stone-800">
        {compressImagesResult}
      </div>
    {/if}
  </section>
</main>
