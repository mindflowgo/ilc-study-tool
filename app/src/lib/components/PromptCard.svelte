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

<div class="rounded-xl border border-stone-200 bg-white shadow-2xs mb-6 overflow-hidden transition">
  <!-- Card Header Bar -->
  <div class="px-4 py-2.5 bg-stone-50/80 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
    <!-- Left: Title & Version Switcher -->
    <div class="flex items-center space-x-3">
      <div class="flex items-center space-x-2">
        <div class="p-1 rounded-md bg-stone-900 text-white shadow-2xs">
          <Sparkles class="w-3.5 h-3.5" />
        </div>
        <span class="text-xs font-semibold text-stone-900">
          {tabName} Prompt
        </span>
      </div>

      <!-- Version Switcher Pills -->
      {#if versions.length > 0}
        <div class="inline-flex items-center bg-stone-200/70 p-0.5 rounded-lg text-xs">
          {#each versions as ver}
            <button
              onclick={() => onSelectVersion && onSelectVersion(ver.id)}
              class="px-2 py-0.5 rounded-md font-medium text-[11px] transition {activeVersionId === ver.id ? 'bg-white text-stone-900 shadow-2xs font-semibold' : 'text-stone-600 hover:text-stone-900'}"
              title="Switch to {ver.label}"
            >
              {ver.label}
            </button>
          {/each}

          {#if onCreateNewVersion}
            <button
              onclick={onCreateNewVersion}
              class="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-stone-500 hover:text-stone-900 hover:bg-stone-300/50 transition ml-0.5"
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
        class="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-medium transition shadow-2xs"
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
        class="p-1 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-200/60 transition"
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
    <div class="p-4 space-y-3 bg-white border-t border-stone-100">
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <label for="prompt-input" class="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
            Prompt Instructions ({activeVersionLabel})
          </label>
          <span class="text-[11px] text-stone-400 font-mono">
            YAML frontmatter
          </span>
        </div>
        <textarea
          id="prompt-input"
          value={localPrompt}
          oninput={handleInput}
          rows="7"
          placeholder="Enter prompt instructions for generating this study material..."
          class="w-full p-3 rounded-lg border border-stone-200 text-xs font-mono leading-relaxed text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-900 transition resize-y"
        ></textarea>
      </div>

      <div class="flex items-center justify-between text-xs pt-1">
        <div class="flex items-center space-x-2">
          {#if isModified}
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
              Prompt modified
            </span>
            <button
              onclick={handleReset}
              class="flex items-center space-x-1 text-stone-500 hover:text-stone-800 underline text-[11px]"
            >
              <RotateCcw class="w-3 h-3" />
              <span>Reset</span>
            </button>
          {:else}
            <span class="text-[11px] text-stone-400">
              Stored in <code>--- prompt: | ---</code> frontmatter.
            </span>
          {/if}
        </div>

        <button
          onclick={handleOpenRegenModal}
          disabled={isGenerating}
          class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-medium transition shadow-2xs"
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
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs animate-in fade-in duration-150">
    <div class="bg-white rounded-xl border border-stone-200 shadow-xl max-w-sm w-full p-5 space-y-4">
      <div class="space-y-1">
        <div class="flex items-center space-x-2">
          <div class="p-1 rounded-md bg-stone-900 text-white">
            <Sparkles class="w-3.5 h-3.5" />
          </div>
          <h3 class="text-sm font-semibold text-stone-900">
            Re-generate {tabName}
          </h3>
        </div>
        <p class="text-xs text-stone-500 leading-relaxed">
          How would you like to apply the AI generation?
        </p>
      </div>

      <div class="space-y-2 pt-1">
        <!-- Option 1: Overwrite Current -->
        <button
          onclick={() => confirmRegeneration(false)}
          class="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition group flex items-start space-x-3"
        >
          <div class="p-1.5 rounded-md bg-stone-100 group-hover:bg-white text-stone-700 shrink-0 mt-0.5">
            <RotateCcw class="w-3.5 h-3.5" />
          </div>
          <div>
            <div class="text-xs font-semibold text-stone-900">
              Overwrite Current ({activeVersionLabel})
            </div>
            <div class="text-[11px] text-stone-500 mt-0.5">
              Replace content in the current file with the new generation.
            </div>
          </div>
        </button>

        <!-- Option 2: Save as New Version -->
        <button
          onclick={() => confirmRegeneration(true)}
          class="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition group flex items-start space-x-3"
        >
          <div class="p-1.5 rounded-md bg-stone-100 group-hover:bg-white text-stone-700 shrink-0 mt-0.5">
            <Layers class="w-3.5 h-3.5" />
          </div>
          <div>
            <div class="text-xs font-semibold text-stone-900">
              Save as New Version (v{nextVersionNumber})
            </div>
            <div class="text-[11px] text-stone-500 mt-0.5">
              Keep current version intact and save output to a new version tab.
            </div>
          </div>
        </button>
      </div>

      <div class="flex justify-end pt-2 border-t border-stone-100">
        <button
          onclick={() => (showRegenModal = false)}
          class="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
