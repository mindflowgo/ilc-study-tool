<script lang="ts">
  import {
    Sparkles,
    ChevronDown,
    ChevronUp,
    Loader2,
    Wand2,
    Plus,
    Layers,
    RotateCcw
  } from 'lucide-svelte';

  export interface VersionItem {
    id: string;
    label: string;
    versionNumber: number;
  }

  interface Props {
    prompt: string;
    tabName: string;
    versions?: VersionItem[];
    activeVersionId?: string;
    isGenerating?: boolean;
    onChangePrompt: (newPrompt: string) => void;
    onRegenerate: (asNewVersion: boolean) => void;
    onSelectVersion?: (versionId: string) => void;
    onCreateNewVersion?: () => void;
    onResetPrompt?: () => void;
  }

  let {
    prompt,
    tabName,
    versions = [],
    activeVersionId = '',
    isGenerating = false,
    onChangePrompt,
    onRegenerate,
    onSelectVersion,
    onCreateNewVersion,
    onResetPrompt
  }: Props = $props();

  let isExpanded = $state(false);
  let localPrompt = $state('');
  let initialPrompt = $state('');
  let showRegenModal = $state(false);

  $effect(() => {
    localPrompt = prompt;
    initialPrompt = prompt;
  });

  let isModified = $derived(localPrompt.trim() !== initialPrompt.trim());

  let activeVersionLabel = $derived.by(() => {
    const found = versions.find((v) => v.id === activeVersionId);
    return found ? found.label : 'v1';
  });

  let nextVersionNumber = $derived.by(() => {
    if (versions.length === 0) return 2;
    const max = Math.max(...versions.map((v) => v.versionNumber));
    return max + 1;
  });

  function handleInput(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    localPrompt = val;
    onChangePrompt(val);
  }

  function handleReset() {
    localPrompt = initialPrompt;
    onChangePrompt(initialPrompt);
    if (onResetPrompt) onResetPrompt();
  }

  function handleOpenRegenModal() {
    showRegenModal = true;
  }

  function confirmRegeneration(asNewVersion: boolean) {
    showRegenModal = false;
    onRegenerate(asNewVersion);
  }
</script>

<div class="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-2xs mb-6 overflow-hidden transition">
  <!-- Card Header Bar -->
  <div class="px-4 py-2.5 bg-stone-50/80 dark:bg-stone-800/80 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3">
    <!-- Left: Title & Version Switcher -->
    <div class="flex items-center space-x-3">
      <div class="flex items-center space-x-2">
        <div class="p-1 rounded-md bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-2xs">
          <Sparkles class="w-3.5 h-3.5" />
        </div>
        <span class="text-xs font-semibold text-stone-900 dark:text-stone-100">
          {tabName} Prompt
        </span>
      </div>

      <!-- Version Switcher Pills -->
      {#if versions.length > 0}
        <div class="inline-flex items-center bg-stone-200/70 dark:bg-stone-800 p-0.5 rounded-lg text-xs">
          {#each versions as ver}
            <button
              onclick={() => onSelectVersion && onSelectVersion(ver.id)}
              class="px-2 py-0.5 rounded-md font-medium text-[11px] transition {activeVersionId === ver.id ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs font-semibold' : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'}"
              title="Switch to {ver.label}"
            >
              {ver.label}
            </button>
          {/each}

          {#if onCreateNewVersion}
            <button
              onclick={onCreateNewVersion}
              class="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-300/50 dark:hover:bg-stone-700/50 transition ml-0.5"
              title="Create new version with default prompt template"
            >
              <Plus class="w-3 h-3" />
              <span>New</span>
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Right: Actions -->
    <div class="flex items-center space-x-2">
      <button
        onclick={handleOpenRegenModal}
        disabled={isGenerating}
        class="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-50 text-white dark:text-stone-900 text-xs font-medium transition shadow-2xs cursor-pointer"
        title="Re-generate content using active AI prompt"
      >
        {#if isGenerating}
          <Loader2 class="w-3.5 h-3.5 animate-spin" />
          <span>Generating...</span>
        {:else}
          <Wand2 class="w-3.5 h-3.5" />
          <span>Re-generate with AI</span>
        {/if}
      </button>

      <button
        onclick={() => (isExpanded = !isExpanded)}
        class="p-1 rounded-md text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition cursor-pointer"
        title={isExpanded ? 'Collapse Prompt' : 'Expand & Edit Prompt'}
      >
        {#if isExpanded}
          <ChevronUp class="w-4 h-4" />
        {:else}
          <ChevronDown class="w-4 h-4" />
        {/if}
      </button>
    </div>
  </div>

  <!-- Collapsible Prompt Textarea -->
  {#if isExpanded}
    <div class="p-4 space-y-3 bg-white dark:bg-stone-900 border-t border-stone-100 dark:border-stone-800">
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <label for="prompt-input" class="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
            Prompt Instructions ({activeVersionLabel})
          </label>
          <span class="text-[11px] text-stone-400 dark:text-stone-500 font-mono">
            YAML frontmatter
          </span>
        </div>
        <textarea
          id="prompt-input"
          value={localPrompt}
          oninput={handleInput}
          rows="7"
          placeholder="Enter prompt instructions for generating this study material..."
          class="w-full p-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-xs font-mono leading-relaxed text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-100 transition resize-y"
        ></textarea>
      </div>

      <div class="flex items-center justify-between text-xs pt-1">
        <div class="flex items-center space-x-2">
          {#if isModified}
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
              Prompt modified
            </span>
            <button
              onclick={handleReset}
              class="flex items-center space-x-1 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 underline text-[11px] cursor-pointer"
            >
              <RotateCcw class="w-3 h-3" />
              <span>Reset</span>
            </button>
          {:else}
            <span class="text-[11px] text-stone-400 dark:text-stone-500">
              Stored in <code>--- prompt: | ---</code> frontmatter.
            </span>
          {/if}
        </div>

        <button
          onclick={handleOpenRegenModal}
          disabled={isGenerating}
          class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-50 text-white dark:text-stone-900 text-xs font-medium transition shadow-2xs cursor-pointer"
        >
          {#if isGenerating}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Generating...</span>
          {:else}
            <Sparkles class="w-3.5 h-3.5" />
            <span>Apply & Re-generate</span>
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- Re-generate Destination Choice Modal -->
{#if showRegenModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
    <div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xl max-w-sm w-full p-5 space-y-4">
      <div class="space-y-1">
        <div class="flex items-center space-x-2">
          <div class="p-1 rounded-md bg-stone-900 dark:bg-stone-800 text-white dark:text-stone-200">
            <Sparkles class="w-3.5 h-3.5" />
          </div>
          <h3 class="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Re-generate {tabName}
          </h3>
        </div>
        <p class="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          How would you like to apply the AI generation?
        </p>
      </div>

      <div class="space-y-2 pt-1">
        <!-- Option 1: Overwrite Current -->
        <button
          onclick={() => confirmRegeneration(false)}
          class="w-full text-left p-3 rounded-lg border border-stone-200 dark:border-stone-800 hover:border-stone-900 dark:hover:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition group flex items-start space-x-3 cursor-pointer"
        >
          <div class="p-1.5 rounded-md bg-stone-100 dark:bg-stone-800 group-hover:bg-white dark:group-hover:bg-stone-700 text-stone-700 dark:text-stone-300 shrink-0 mt-0.5">
            <RotateCcw class="w-3.5 h-3.5" />
          </div>
          <div>
            <div class="text-xs font-semibold text-stone-900 dark:text-stone-100">
              Overwrite Current ({activeVersionLabel})
            </div>
            <div class="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
              Replace content in the current file with the new generation.
            </div>
          </div>
        </button>

        <!-- Option 2: Save as New Version -->
        <button
          onclick={() => confirmRegeneration(true)}
          class="w-full text-left p-3 rounded-lg border border-stone-200 dark:border-stone-800 hover:border-stone-900 dark:hover:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition group flex items-start space-x-3 cursor-pointer"
        >
          <div class="p-1.5 rounded-md bg-stone-100 dark:bg-stone-800 group-hover:bg-white dark:group-hover:bg-stone-700 text-stone-700 dark:text-stone-300 shrink-0 mt-0.5">
            <Layers class="w-3.5 h-3.5" />
          </div>
          <div>
            <div class="text-xs font-semibold text-stone-900 dark:text-stone-100">
              Save as New Version (v{nextVersionNumber})
            </div>
            <div class="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
              Keep current version intact and save output to a new version tab.
            </div>
          </div>
        </button>
      </div>

      <div class="flex justify-end pt-2 border-t border-stone-100 dark:border-stone-800">
        <button
          onclick={() => (showRegenModal = false)}
          class="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
