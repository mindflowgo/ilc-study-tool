<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import UploadModal from '$lib/components/UploadModal.svelte';
  import type { CourseManifest } from '$lib/parser/courseIngest';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    BookOpen,
    Plus,
    Search,
    GraduationCap,
    Layers,
    FileText,
    Sparkles,
    CheckCircle2,
    ArrowRight
  } from 'lucide-svelte';

  let courses: CourseManifest[] = $state([]);
  let isLoading = $state(true);
  let searchQuery = $state('');
  let isUploadModalOpen = $state(false);

  async function loadCourses() {
    isLoading = true;
    try {
      const res = await fetch('/api/courses');
      if (res.ok) {
        const data = await res.json();
        courses = data.courses || [];
      }
    } catch (e) {
      console.error('Failed to load courses:', e);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadCourses();
  });

  function handleCourseUploaded(courseId: string) {
    loadCourses();
    goto(`/courses/${courseId}`);
  }

  let filteredCourses = $derived(
    courses.filter(
      (c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
</script>

<Header />

<main class="flex-1 overflow-y-auto px-4 py-8 sm:px-8 max-w-6xl mx-auto w-full space-y-8">
  <!-- Page Hero & Search -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-stone-900">Your Courses</h1>
      <p class="text-xs text-stone-500 mt-1">
        Distraction-free study notes, summaries, cheatsheets, and interactive practice tests.
      </p>
    </div>

    <div class="flex items-center space-x-3">
      <div class="relative w-full sm:w-64">
        <Search class="absolute left-3 top-2.5 w-3.5 h-3.5 text-stone-400" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Filter courses..."
          class="w-full pl-9 pr-3 py-1.5 rounded-lg border border-stone-200 bg-white text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 transition"
        />
      </div>

      <button
        onclick={() => (isUploadModalOpen = true)}
        class="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 transition shadow-2xs shrink-0"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>Add Course</span>
      </button>
    </div>
  </div>

  <!-- Course Cards Grid -->
  {#if isLoading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each [1, 2, 3] as _}
        <div class="h-56 rounded-2xl border border-stone-200 bg-white p-6 animate-pulse space-y-4">
          <div class="w-16 h-5 bg-stone-100 rounded"></div>
          <div class="w-3/4 h-6 bg-stone-100 rounded"></div>
          <div class="w-full h-12 bg-stone-100 rounded"></div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each filteredCourses as course}
        {@const totalLessons = course.units.reduce((acc, u) => acc + u.lessons.length, 0)}
        <a
          href="/courses/{course.id}"
          class="group relative rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs hover:shadow-md hover:border-stone-300 transition flex flex-col justify-between"
        >
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-200">
                {course.id}
              </span>
              <span class="text-[11px] text-stone-400 font-medium">
                {course.grade || 'ILC'}
              </span>
            </div>

            <div>
              <h2 class="text-base font-semibold text-stone-900 group-hover:text-stone-700 transition">
                {course.title}
              </h2>
              {#if course.description}
                <p class="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">
                  {course.description}
                </p>
              {/if}
            </div>

            <!-- Stats & Pills -->
            <div class="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-stone-600">
              <div class="flex items-center space-x-1 px-2 py-1 rounded bg-stone-50 border border-stone-100">
                <Layers class="w-3 h-3 text-stone-400" />
                <span>{course.units.length} Units</span>
              </div>
              <div class="flex items-center space-x-1 px-2 py-1 rounded bg-stone-50 border border-stone-100">
                <FileText class="w-3 h-3 text-stone-400" />
                <span>{totalLessons} Lessons</span>
              </div>
            </div>
          </div>

          <!-- Bottom Footer -->
          <div class="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs font-medium text-stone-700 group-hover:text-stone-900">
            <span>Study Course</span>
            <ArrowRight class="w-4 h-4 transform group-hover:translate-x-1 transition" />
          </div>
        </a>
      {/each}

      <!-- Add New Course Card -->
      <button
        onclick={() => (isUploadModalOpen = true)}
        class="h-full min-h-[220px] rounded-2xl border-2 border-dashed border-stone-200 hover:border-stone-400 hover:bg-stone-50/50 p-6 flex flex-col items-center justify-center text-center space-y-3 transition group"
      >
        <div class="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-stone-200 text-stone-600 flex items-center justify-center transition">
          <Plus class="w-5 h-5" />
        </div>
        <div>
          <div class="text-sm font-semibold text-stone-800">Add New Course</div>
          <p class="text-xs text-stone-400 mt-0.5">Upload a block of ILC course content (.zip)</p>
        </div>
      </button>
    </div>
  {/if}
</main>

<UploadModal
  isOpen={isUploadModalOpen}
  onClose={() => (isUploadModalOpen = false)}
  onUploaded={handleCourseUploaded}
/>
