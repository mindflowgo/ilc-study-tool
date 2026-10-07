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
    ArrowRight,
    Folder,
    Loader2
  } from 'lucide-svelte';
  import { exportDocumentToPdf } from '$lib/pdf/exportPdf';
  import { apiFetch, isTauriEnvironment } from '$lib/api';

  let courses: CourseManifest[] = $state([]);
  let isLoading = $state(true);
  let searchQuery = $state('');
  let isUploadModalOpen = $state(false);
  let activeDownloads: Record<string, string | null> = $state({});

  async function handleDownloadCoursePdf(
    course: CourseManifest,
    type: 'notes' | 'summary' | 'cheatsheet' | 'test'
  ) {
    const key = `${course.id}:${type}`;
    if (activeDownloads[key]) return;
    activeDownloads[key] = 'loading';

    try {
      if (type === 'notes') {
        const res = await apiFetch(`/api/courses/${course.id}/course-docs?type=notes`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || errData.error || 'Failed to assemble course notes');
        }
        const data = await res.json();
        if (!data.markdown || !data.markdown.trim()) {
          throw new Error('No lesson notes found for this course');
        }

        await exportDocumentToPdf({
          courseCode: course.id,
          courseTitle: course.title,
          lessonId: 'Course',
          lessonTitle: 'Complete Course Notes',
          tab: 'lesson',
          tabDisplayName: 'Complete Notes',
          rawMarkdown: data.markdown
        });
      } else {
        // summary, cheatsheet, test
        const res = await apiFetch(`/api/courses/${course.id}/course-docs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || errData.error || `Failed to generate course ${type}`);
        }
        const data = await res.json();
        if (!data.markdown || !data.markdown.trim()) {
          throw new Error(`Generated course ${type} was empty`);
        }

        // Update local courseDocs state
        if (!course.courseDocs) {
          course.courseDocs = { summary: false, cheatsheet: false, test: false };
        }
        course.courseDocs[type] = true;

        const displayTitles: Record<string, { lessonTitle: string; tabDisplayName: string }> = {
          summary: { lessonTitle: 'Comprehensive Course Summary', tabDisplayName: 'Course Summary' },
          cheatsheet: { lessonTitle: 'Master Course Cheatsheet', tabDisplayName: 'Course Cheatsheet' },
          test: { lessonTitle: 'Final Course Practice Exam', tabDisplayName: 'Course Practice Test' }
        };

        await exportDocumentToPdf({
          courseCode: course.id,
          courseTitle: course.title,
          lessonId: 'Course',
          lessonTitle: displayTitles[type].lessonTitle,
          tab: type,
          tabDisplayName: displayTitles[type].tabDisplayName,
          rawMarkdown: data.markdown
        });
      }
    } catch (err: any) {
      console.error(`Failed to export course ${type}:`, err);
      alert(err?.message || `Failed to download course ${type} PDF`);
    } finally {
      delete activeDownloads[key];
    }
  }

  async function openCourseFolder(courseId: string, path?: string) {
    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_course_folder', { courseId, path });
        return;
      } catch (err) {
        console.error('Failed to open course folder via Tauri:', err);
      }
    }

    try {
      const res = await apiFetch(`/api/courses/${courseId}/open`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to open course folder via API:', data.error || res.statusText);
      }
    } catch (e) {
      console.error('Failed to open course folder:', e);
    }
  }

  async function loadCourses() {
    isLoading = true;
    try {
      const res = await apiFetch('/api/courses');
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
      <h1 class="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Your Courses</h1>
      <p class="text-xs text-stone-500 dark:text-stone-400 mt-1">
        Distraction-free study notes, summaries, cheatsheets, and interactive practice tests.
      </p>
    </div>

    <div class="flex items-center space-x-3">
      <div class="relative w-full sm:w-64">
        <Search class="absolute left-3 top-2.5 w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Filter courses..."
          class="w-full pl-9 pr-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-100 transition"
        />
      </div>

      <button
        onclick={() => (isUploadModalOpen = true)}
        class="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-medium hover:bg-stone-800 dark:hover:bg-white transition shadow-2xs shrink-0 cursor-pointer"
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
        <div class="h-56 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 animate-pulse space-y-4">
          <div class="w-16 h-5 bg-stone-100 dark:bg-stone-800 rounded"></div>
          <div class="w-3/4 h-6 bg-stone-100 dark:bg-stone-800 rounded"></div>
          <div class="w-full h-12 bg-stone-100 dark:bg-stone-800 rounded"></div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each filteredCourses as course}
        {@const totalLessons = course.units.reduce((acc, u) => acc + u.lessons.length, 0)}
        <a
          href="/courses/{course.id}"
          class="group relative rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 shadow-2xs hover:shadow-md hover:border-stone-300 dark:hover:border-stone-700 transition flex flex-col justify-between"
        >
          <div class="space-y-3">
            <div>
              <h2 class="text-base font-semibold text-stone-900 dark:text-stone-100 group-hover:text-stone-700 dark:group-hover:text-stone-300 transition">
                <span class="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700">
                {course.id}
              </span> {course.title}
              </h2>
            </div>

            <!-- Stats & Pills -->
            <div class="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-stone-600 dark:text-stone-400">
              <div class="flex items-center space-x-1 px-2 py-1 rounded bg-stone-50 dark:bg-stone-800/60 border border-stone-100 dark:border-stone-700/80">
                <Layers class="w-3 h-3 text-stone-400 dark:text-stone-500" />
                <span>{course.units.length} Units</span>
              </div>
              <div class="flex items-center space-x-1 px-2 py-1 rounded bg-stone-50 dark:bg-stone-800/60 border border-stone-100 dark:border-stone-700/80">
                <FileText class="w-3 h-3 text-stone-400 dark:text-stone-500" />
                <span>{totalLessons} Lessons</span>
              </div>
            <ArrowRight class="w-4 h-4 transform group-hover:translate-x-1 transition" />
            </div>
          </div>

          <!-- Bottom Footer -->
          <div class="mt-1 pt-2 border-t border-stone-100 dark:border-stone-800">
            <div class="flex items-center justify-between">
              <div class="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Download Course PDFs</div>
              <button
                type="button"
                title="Open course folder"
                aria-label="Open course folder"
                onclick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCourseFolder(course.id, course.path);
                }}
                class="p-1 -mr-1 rounded-md text-stone-400 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 hover:border-stone-200 dark:hover:border-stone-700 border border-transparent transition cursor-pointer"
              >
                <Folder class="w-3.5 h-3.5" />
              </button>
            </div>

            <div class="grid grid-cols-4 gap-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 mt-2">
              <!-- Notes -->
              <button
                type="button"
                title="Download complete course notes PDF"
                onclick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDownloadCoursePdf(course, 'notes');
                }}
                disabled={Boolean(activeDownloads[`${course.id}:notes`])}
                class="flex items-center justify-center space-x-1 px-1.5 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 transition cursor-pointer disabled:opacity-50"
              >
                {#if activeDownloads[`${course.id}:notes`]}
                  <Loader2 class="w-3 h-3 animate-spin text-stone-600 dark:text-stone-400" />
                {:else}
                  <span>Notes</span>
                {/if}
              </button>

              <!-- Summary -->
              <button
                type="button"
                title={course.courseDocs?.summary ? 'Download Course Summary PDF' : 'Generate & Download Course Summary PDF'}
                onclick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDownloadCoursePdf(course, 'summary');
                }}
                disabled={Boolean(activeDownloads[`${course.id}:summary`])}
                class="flex items-center justify-center space-x-1 px-1.5 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 transition cursor-pointer disabled:opacity-50 relative"
              >
                {#if activeDownloads[`${course.id}:summary`]}
                  <Loader2 class="w-3 h-3 animate-spin text-amber-600" />
                {:else}
                  <span>Summary</span>
                  {#if course.courseDocs?.summary}
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Generated"></span>
                  {/if}
                {/if}
              </button>

              <!-- Cheatsheet -->
              <button
                type="button"
                title={course.courseDocs?.cheatsheet ? 'Download Course Cheatsheet PDF' : 'Generate & Download Course Cheatsheet PDF'}
                onclick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDownloadCoursePdf(course, 'cheatsheet');
                }}
                disabled={Boolean(activeDownloads[`${course.id}:cheatsheet`])}
                class="flex items-center justify-center space-x-1 px-1.5 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 transition cursor-pointer disabled:opacity-50 relative"
              >
                {#if activeDownloads[`${course.id}:cheatsheet`]}
                  <Loader2 class="w-3 h-3 animate-spin text-amber-600" />
                {:else}
                  <span>Cheatsheet</span>
                  {#if course.courseDocs?.cheatsheet}
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Generated"></span>
                  {/if}
                {/if}
              </button>

              <!-- Test -->
              <button
                type="button"
                title={course.courseDocs?.test ? 'Download Course Practice Test PDF' : 'Generate & Download Course Practice Test PDF'}
                onclick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDownloadCoursePdf(course, 'test');
                }}
                disabled={Boolean(activeDownloads[`${course.id}:test`])}
                class="flex items-center justify-center space-x-1 px-1.5 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 transition cursor-pointer disabled:opacity-50 relative"
              >
                {#if activeDownloads[`${course.id}:test`]}
                  <Loader2 class="w-3 h-3 animate-spin text-amber-600" />
                {:else}
                  <span>Test</span>
                  {#if course.courseDocs?.test}
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Generated"></span>
                  {/if}
                {/if}
              </button>
            </div>
          </div>
        </a>
      {/each}

      <!-- Add New Course Card -->
      <button
        onclick={() => (isUploadModalOpen = true)}
        class="h-full min-h-[220px] rounded-2xl border-2 border-dashed border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 hover:bg-stone-50/50 dark:hover:bg-stone-900/50 p-6 flex flex-col items-center justify-center text-center space-y-3 transition group cursor-pointer"
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
