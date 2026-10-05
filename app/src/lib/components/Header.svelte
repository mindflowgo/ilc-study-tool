<script lang="ts">
  import { page } from '$app/stores';
  import { BookOpen, Sparkles, Settings, GraduationCap, ChevronRight } from 'lucide-svelte';
  import AIQueuePopover from './AIQueuePopover.svelte';

  interface Props {
    courseId?: string;
    courseTitle?: string;
    lessonTitle?: string;
    onLessonUpdated?: (lessonId: string, tab: string) => void;
  }

  let { courseId = '', courseTitle = '', lessonTitle = '', onLessonUpdated }: Props = $props();

  let activePath = $derived($page.url.pathname);
</script>

<header class="h-14 border-b border-stone-200 bg-white/95 px-4 backdrop-blur flex items-center justify-between z-20 shrink-0">
  <!-- Left: Branding & Breadcrumbs -->
  <div class="flex items-center space-x-3 overflow-hidden">
    <a href="/" class="flex items-center space-x-2 text-stone-900 hover:text-stone-700 transition font-medium shrink-0">
      <div class="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center shadow-sm">
        <GraduationCap class="w-4 h-4" />
      </div>
      <span class="font-semibold tracking-tight text-base hidden sm:inline">Study Tool</span>
    </a>

    {#if courseId}
      <div class="flex items-center space-x-2 text-xs text-stone-400 overflow-hidden text-ellipsis whitespace-nowrap">
        <ChevronRight class="w-3.5 h-3.5 shrink-0" />
        <a href="/courses/{courseId}" class="hover:text-stone-900 transition font-medium text-stone-600 truncate max-w-[140px] sm:max-w-[200px]">
          {courseTitle || courseId.toUpperCase()}
        </a>
        {#if lessonTitle}
          <ChevronRight class="w-3.5 h-3.5 shrink-0" />
          <span class="text-stone-800 font-medium truncate max-w-[160px] sm:max-w-[320px]">
            {lessonTitle}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Right: Top-Level Navigation & Background AI Queue -->
  <nav class="flex items-center space-x-1.5 shrink-0">
    <AIQueuePopover {courseId} {onLessonUpdated} />

    <a
      href="/"
      class="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition {activePath === '/' || activePath.startsWith('/courses') ? 'bg-stone-100 text-stone-900' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'}"
    >
      <BookOpen class="w-3.5 h-3.5" />
      <span>Courses</span>
    </a>

    <a
      href="/prompts"
      class="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition {activePath.startsWith('/prompts') ? 'bg-stone-100 text-stone-900' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'}"
    >
      <Sparkles class="w-3.5 h-3.5" />
      <span>Prompts</span>
    </a>

    <a
      href="/settings"
      class="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition {activePath.startsWith('/settings') ? 'bg-stone-100 text-stone-900' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'}"
    >
      <Settings class="w-3.5 h-3.5" />
      <span>Settings</span>
    </a>
  </nav>
</header>
