<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import CodeMirrorEditor from '$lib/components/CodeMirrorEditor.svelte';
  import type { PromptItem } from '$lib/server/prompts';
  import { onMount } from 'svelte';
  import { Sparkles, Save, Check, Loader2, FileCode, Info } from 'lucide-svelte';

  let prompts: PromptItem[] = $state([]);
  let selectedPromptId: string = $state('');
  let editorContent: string = $state('');
  let originalContent: string = $state('');
  let isLoading = $state(true);
  let isSaving = $state(false);
  let saveSuccess = $state(false);

  let selectedPrompt = $derived(
    prompts.find((p) => p.id === selectedPromptId)
  );

  let hasUnsavedChanges = $derived(
    editorContent !== originalContent
  );

  async function loadPrompts() {
    isLoading = true;
    try {
      const res = await fetch('/api/prompts');
      if (res.ok) {
        const data = await res.json();
        prompts = data.prompts || [];
        if (prompts.length > 0 && !selectedPromptId) {
          selectPrompt(prompts[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load prompts:', e);
    } finally {
      isLoading = false;
    }
  }

  function selectPrompt(id: string) {
    selectedPromptId = id;
    const p = prompts.find((item) => item.id === id);
    if (p) {
      editorContent = p.content;
      originalContent = p.content;
    }
  }

  async function savePrompt() {
    if (!selectedPromptId) return;
    isSaving = true;

    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPromptId,
          content: editorContent
        })
      });

      if (res.ok) {
        originalContent = editorContent;
        const p = prompts.find((item) => item.id === selectedPromptId);
        if (p) p.content = editorContent;

        saveSuccess = true;
        setTimeout(() => {
          saveSuccess = false;
        }, 2000);
      }
    } catch (e) {
      console.error('Failed to save prompt:', e);
    } finally {
      isSaving = false;
    }
  }

  onMount(() => {
    loadPrompts();
  });
</script>

<Header />

<main class="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar: Prompts List -->
    <aside class="w-64 border-r border-stone-200 bg-white p-4 flex flex-col justify-between shrink-0">
      <div class="space-y-4">
        <div>
          <h2 class="text-sm font-semibold text-stone-900 flex items-center space-x-1.5">
            <Sparkles class="w-4 h-4 text-stone-700" />
            <span>Prompt Templates</span>
          </h2>
          <p class="text-[11px] text-stone-500 mt-0.5">
            Prompts used for lesson summaries, cheatsheets, and KICA tests.
          </p>
        </div>

        {#if isLoading}
          <div class="space-y-2">
            {#each [1, 2, 3] as _}
              <div class="h-10 rounded-lg bg-stone-100 animate-pulse"></div>
            {/each}
          </div>
        {:else}
          <div class="space-y-1">
            {#each prompts as p}
              {@const isSelected = p.id === selectedPromptId}
              <button
                onclick={() => selectPrompt(p.id)}
                class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center space-x-2 {isSelected ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'}"
              >
                <FileCode class="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span class="truncate">{p.title || p.id}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Variable Reference Card -->
      <div class="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 text-[11px] text-stone-600">
        <div class="flex items-center space-x-1 font-semibold text-stone-800">
          <Info class="w-3.5 h-3.5 text-stone-500" />
          <span>Template Variables</span>
        </div>
        <ul class="space-y-1 font-mono text-[10px] text-stone-500">
          <li><code>{"{{lesson_title}}"}</code> - Title</li>
          <li><code>{"{{unit}}"}</code> - Unit name</li>
          <li><code>{"{{content}}"}</code> - Lesson text</li>
        </ul>
      </div>
    </aside>

    <!-- Right: Editor Area -->
    <section class="flex-1 flex flex-col overflow-hidden bg-stone-50 p-6">
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-stone-200">
        <div>
          <h1 class="text-base font-semibold text-stone-900">
            {selectedPrompt ? selectedPrompt.title : 'Prompt Editor'}
          </h1>
          <p class="text-xs text-stone-400 font-mono">
            data/prompts/{selectedPrompt ? selectedPrompt.filename : ''}
          </p>
        </div>

        <button
          onclick={savePrompt}
          disabled={isSaving || !hasUnsavedChanges}
          class="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
        >
          {#if isSaving}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Saving...</span>
          {:else if saveSuccess}
            <Check class="w-3.5 h-3.5 text-emerald-400" />
            <span>Saved!</span>
          {:else}
            <Save class="w-3.5 h-3.5" />
            <span>Save Prompt</span>
          {/if}
        </button>
      </div>

      <div class="flex-1 min-h-0 bg-white rounded-xl border border-stone-200 shadow-2xs overflow-hidden">
        <CodeMirrorEditor
          value={editorContent}
          onChange={(val) => (editorContent = val)}
          onSave={savePrompt}
        />
      </div>
    </section>
  </div>
</main>
