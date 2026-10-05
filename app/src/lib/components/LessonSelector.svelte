<script lang="ts">
  import type { CourseManifest, CourseManifestLesson } from '$lib/parser/courseIngest';
  import { ChevronLeft, ChevronRight, ChevronDown, Check, Search, FileText, Bookmark } from 'lucide-svelte';

  interface Props {
    course: CourseManifest;
    selectedLessonId: string;
    onSelectLesson: (lessonId: string) => void;
  }

  let { course, selectedLessonId, onSelectLesson }: Props = $props();

  let isOpen = $state(false);
  let searchQuery = $state('');

  // Flatten lessons for previous / next navigation
  let allLessons = $derived(
    course.units.flatMap((u) => u.lessons)
  );

  let currentIndex = $derived(
    allLessons.findIndex((l) => l.id === selectedLessonId)
  );

  let currentLesson = $derived(
    currentIndex !== -1 ? allLessons[currentIndex] : allLessons[0]
  );

  let hasPrev = $derived(currentIndex > 0);
  let hasNext = $derived(currentIndex < allLessons.length - 1 && currentIndex !== -1);

  function prevLesson() {
    if (hasPrev) {
      onSelectLesson(allLessons[currentIndex - 1].id);
    }
  }

  function nextLesson() {
    if (hasNext) {
      onSelectLesson(allLessons[currentIndex + 1].id);
    }
  }

  function toggleDropdown() {
    isOpen = !isOpen;
    if (isOpen) searchQuery = '';
  }

  function selectAndClose(id: string) {
    onSelectLesson(id);
    isOpen = false;
  }

  // Filtered units based on search
  let filteredUnits = $derived(
    course.units
      .map((u) => ({
        ...u,
        lessons: u.lessons.filter((l) =>
          l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.id.includes(searchQuery)
        )
      }))
      .filter((u) => u.lessons.length > 0)
  );
</script>

<div class="relative flex items-center space-x-1.5 text-xs">
  <!-- Prev Button -->
  <button
    onclick={prevLesson}
    disabled={!hasPrev}
    title="Previous lesson"
    class="p-1.5 rounded border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed text-stone-700 transition"
  >
    <ChevronLeft class="w-4 h-4" />
  </button>

  <!-- Dropdown Trigger -->
  <div class="relative">
    <button
      onclick={toggleDropdown}
      class="flex items-center space-x-2 px-3 py-1.5 rounded border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 font-medium transition shadow-2xs max-w-[280px] sm:max-w-md"
    >
      {#if currentLesson?.type === 'assignment'}
        <Bookmark class="w-3.5 h-3.5 text-purple-600 shrink-0" />
      {:else}
        <FileText class="w-3.5 h-3.5 text-stone-500 shrink-0" />
      {/if}
      <span class="truncate">
        {currentLesson ? currentLesson.title : 'Select a lesson'}
      </span>
      <ChevronDown class="w-3.5 h-3.5 text-stone-400 shrink-0 ml-1" />
    </button>

    <!-- Dropdown Menu -->
    {#if isOpen}
      <div
        class="fixed inset-0 z-30"
        onclick={() => (isOpen = false)}
        role="presentation"
      ></div>

      <div class="absolute left-0 mt-1 w-80 sm:w-96 rounded-lg border border-stone-200 bg-white shadow-xl z-40 overflow-hidden flex flex-col max-h-[480px]">
        <!-- Search bar -->
        <div class="p-2 border-b border-stone-100 bg-stone-50/50 flex items-center space-x-2">
          <Search class="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search lessons..."
            class="w-full bg-transparent text-xs text-stone-800 placeholder-stone-400 focus:outline-none"
          />
        </div>

        <!-- Lessons list by Unit -->
        <div class="overflow-y-auto divide-y divide-stone-100 p-1">
          {#each filteredUnits as unit}
            <div class="py-1">
              <div class="px-2 py-1 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                Unit {unit.number}: {unit.title}
              </div>
              <div class="space-y-0.5">
                {#each unit.lessons as lesson}
                  {@const isSelected = lesson.id === selectedLessonId}
                  <button
                    onclick={() => selectAndClose(lesson.id)}
                    class="w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between text-xs transition {isSelected ? 'bg-stone-900 text-white font-medium' : 'text-stone-700 hover:bg-stone-100'}"
                  >
                    <div class="flex items-center space-x-2 truncate pr-2">
                      {#if lesson.type === 'assignment'}
                        <span class="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase {isSelected ? 'bg-purple-800 text-purple-200' : 'bg-purple-100 text-purple-700'}">
                          Assign
                        </span>
                      {:else}
                        <span class="font-mono text-[11px] opacity-60">
                          {lesson.id}
                        </span>
                      {/if}
                      <span class="truncate">{lesson.title}</span>
                    </div>
                    {#if isSelected}
                      <Check class="w-3.5 h-3.5 shrink-0" />
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="p-4 text-center text-xs text-stone-400">
              No lessons match your search.
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Next Button -->
  <button
    onclick={nextLesson}
    disabled={!hasNext}
    title="Next lesson"
    class="p-1.5 rounded border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed text-stone-700 transition"
  >
    <ChevronRight class="w-4 h-4" />
  </button>
</div>
