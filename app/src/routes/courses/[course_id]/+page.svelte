<script lang="ts">
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';
  import LessonSelector from '$lib/components/LessonSelector.svelte';
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte';
  import CodeMirrorEditor from '$lib/components/CodeMirrorEditor.svelte';
  import QuizRunner from '$lib/components/QuizRunner.svelte';
  import UploadModal from '$lib/components/UploadModal.svelte';
  import type { CourseManifest } from '$lib/parser/courseIngest';
  import { onMount } from 'svelte';
  import {
    BookOpen,
    FileText,
    ListCollapse,
    Sparkles,
    CheckCircle2,
    Eye,
    Edit3,
    Save,
    RotateCw,
    Download,
    Layers,
    Loader2,
    Check,
    Plus
  } from 'lucide-svelte';

  let courseId = $derived($page.params.course_id);
  let course: CourseManifest | null = $state(null);
  let selectedLessonId: string = $state('');
  let activeTab: 'lesson' | 'summary' | 'cheatsheet' | 'test' = $state('lesson');
  let isEditing: boolean = $state(false);
  let isUploadModalOpen: boolean = $state(false);

  // Lesson tab contents
  let tabContents: Record<string, string> = $state({
    lesson: '',
    summary: '',
    cheatsheet: '',
    test: ''
  });

  let originalContents: Record<string, string> = $state({
    lesson: '',
    summary: '',
    cheatsheet: '',
    test: ''
  });

  let isLoadingCourse = $state(true);
  let isLoadingLesson = $state(false);
  let isSaving = $state(false);
  let saveSuccessMessage = $state('');

  // Check if current tab has unsaved changes
  let hasUnsavedChanges = $derived(
    tabContents[activeTab] !== originalContents[activeTab]
  );

  async function loadCourse(selectTargetLessonId?: string) {
    isLoadingCourse = true;
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (res.ok) {
        const data = await res.json();
        course = data.course;
        if (course && course.units.length > 0 && course.units[0].lessons.length > 0) {
          const target = selectTargetLessonId || selectedLessonId || course.units[0].lessons[0].id;
          await loadLesson(target);
        }
      }
    } catch (e) {
      console.error('Failed to load course:', e);
    } finally {
      isLoadingCourse = false;
    }
  }

  async function loadLesson(lessonId: string) {
    selectedLessonId = lessonId;
    isLoadingLesson = true;
    try {
      const res = await fetch(`/api/courses/${courseId}/${lessonId}`);
      if (res.ok) {
        const data = await res.json();
        tabContents = {
          lesson: data.lesson || '',
          summary: data.summary || '',
          cheatsheet: data.cheatsheet || '',
          test: data.test || ''
        };
        originalContents = { ...tabContents };
      }
    } catch (e) {
      console.error('Failed to load lesson:', e);
    } finally {
      isLoadingLesson = false;
    }
  }

  async function saveCurrentTab() {
    if (!selectedLessonId) return;
    isSaving = true;

    try {
      const res = await fetch(`/api/courses/${courseId}/${selectedLessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: activeTab,
          content: tabContents[activeTab]
        })
      });

      if (res.ok) {
        originalContents[activeTab] = tabContents[activeTab];
        saveSuccessMessage = 'Saved!';
        setTimeout(() => {
          saveSuccessMessage = '';
        }, 2000);
      }
    } catch (e) {
      console.error('Failed to save tab:', e);
    } finally {
      isSaving = false;
    }
  }

  function handleEditorChange(newVal: string) {
    tabContents[activeTab] = newVal;
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentTab();
    }
  }

  function handleChaptersUploaded(uploadedCourseId: string) {
    loadCourse();
    saveSuccessMessage = 'New chapters added!';
    setTimeout(() => {
      saveSuccessMessage = '';
    }, 3000);
  }

  onMount(() => {
    loadCourse();
  });

  // Current lesson title
  let currentLessonTitle = $derived.by(() => {
    if (!course) return '';
    for (const u of course.units) {
      const found = u.lessons.find((l) => l.id === selectedLessonId);
      if (found) return found.title;
    }
    return '';
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<Header
  courseId={course?.id}
  courseTitle={course?.title}
  lessonTitle={currentLessonTitle}
/>

{#if isLoadingCourse}
  <div class="flex-1 flex items-center justify-center">
    <Loader2 class="w-6 h-6 animate-spin text-stone-400" />
  </div>
{:else if !course}
  <div class="flex-1 flex flex-col items-center justify-center space-y-3">
    <p class="text-sm text-stone-500">Course not found.</p>
    <a href="/" class="text-xs text-stone-900 font-medium underline">Return to courses</a>
  </div>
{:else}
  <div class="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
    <!-- Sub-Header: Lesson Selector & Tabs -->
    <div class="border-b border-stone-200 bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <!-- Left: Lesson Selector & Add Chapters Button -->
      <div class="flex items-center space-x-2">
        <LessonSelector
          {course}
          {selectedLessonId}
          onSelectLesson={loadLesson}
        />

        <button
          onclick={() => (isUploadModalOpen = true)}
          class="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-medium text-stone-700 transition shadow-2xs shrink-0"
          title="Add new chapters / lessons to this course"
        >
          <Plus class="w-3.5 h-3.5 text-stone-500" />
          <span class="hidden md:inline">Add Chapters</span>
        </button>
      </div>

      <!-- Middle: Study Tabs (Full | Summary | Cheatsheet | Test) -->
      <div class="inline-flex rounded-lg border border-stone-200 p-0.5 bg-stone-100 text-xs font-medium">
        <button
          onclick={() => { activeTab = 'lesson'; isEditing = false; }}
          class="flex items-center space-x-1.5 px-3 py-1 rounded-md transition {activeTab === 'lesson' ? 'bg-white text-stone-900 shadow-2xs font-semibold' : 'text-stone-600 hover:text-stone-900'}"
        >
          <BookOpen class="w-3.5 h-3.5" />
          <span>Full Lesson</span>
        </button>

        <button
          onclick={() => { activeTab = 'summary'; isEditing = false; }}
          class="flex items-center space-x-1.5 px-3 py-1 rounded-md transition {activeTab === 'summary' ? 'bg-white text-stone-900 shadow-2xs font-semibold' : 'text-stone-600 hover:text-stone-900'}"
        >
          <Sparkles class="w-3.5 h-3.5" />
          <span>Summary</span>
        </button>

        <button
          onclick={() => { activeTab = 'cheatsheet'; isEditing = false; }}
          class="flex items-center space-x-1.5 px-3 py-1 rounded-md transition {activeTab === 'cheatsheet' ? 'bg-white text-stone-900 shadow-2xs font-semibold' : 'text-stone-600 hover:text-stone-900'}"
        >
          <ListCollapse class="w-3.5 h-3.5" />
          <span>Cheatsheet</span>
        </button>

        <button
          onclick={() => { activeTab = 'test'; isEditing = false; }}
          class="flex items-center space-x-1.5 px-3 py-1 rounded-md transition {activeTab === 'test' ? 'bg-white text-stone-900 shadow-2xs font-semibold' : 'text-stone-600 hover:text-stone-900'}"
        >
          <CheckCircle2 class="w-3.5 h-3.5" />
          <span>Practice Test</span>
        </button>
      </div>

      <!-- Right: Action Controls (Edit Mode / Save) -->
      <div class="flex items-center space-x-2">
        {#if activeTab !== 'test'}
          <button
            onclick={() => (isEditing = !isEditing)}
            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition {isEditing ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'}"
          >
            {#if isEditing}
              <Eye class="w-3.5 h-3.5" />
              <span>Reader View</span>
            {:else}
              <Edit3 class="w-3.5 h-3.5" />
              <span>Edit Markdown</span>
            {/if}
          </button>
        {/if}

        <button
          onclick={saveCurrentTab}
          disabled={isSaving || !hasUnsavedChanges}
          title="Save file (⌘+S)"
          class="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50 text-stone-800 shadow-2xs"
        >
          {#if isSaving}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Saving...</span>
          {:else if saveSuccessMessage}
            <Check class="w-3.5 h-3.5 text-emerald-600" />
            <span class="text-emerald-600 font-semibold">{saveSuccessMessage}</span>
          {:else}
            <Save class="w-3.5 h-3.5" />
            <span>Save</span>
            {#if hasUnsavedChanges}
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500 ml-0.5"></span>
            {/if}
          {/if}
        </button>
      </div>
    </div>

    <!-- Main Workspace Content Area -->
    <div class="flex-1 overflow-y-auto p-4 sm:p-8 max-w-5xl mx-auto w-full">
      {#if isLoadingLesson}
        <div class="h-64 flex items-center justify-center">
          <Loader2 class="w-6 h-6 animate-spin text-stone-300" />
        </div>
      {:else if activeTab === 'test'}
        <!-- Practice Test Interactive Runner & Editor -->
        <QuizRunner
          testMarkdown={tabContents.test}
          onSaveMarkdown={(val) => {
            tabContents.test = val;
            saveCurrentTab();
          }}
        />
      {:else if isEditing}
        <!-- CodeMirror Editor -->
        <div class="h-[calc(100vh-11rem)]">
          <CodeMirrorEditor
            value={tabContents[activeTab]}
            onChange={handleEditorChange}
            onSave={saveCurrentTab}
          />
        </div>
      {:else}
        <!-- Markdown Reader View -->
        <article class="bg-white rounded-2xl border border-stone-200 p-6 sm:p-10 shadow-2xs">
          <MarkdownViewer
            markdown={tabContents[activeTab]}
            courseId={course.id}
          />
        </article>
      {/if}
    </div>
  </div>

  <UploadModal
    isOpen={isUploadModalOpen}
    presetCourseId={course.id}
    onClose={() => (isUploadModalOpen = false)}
    onUploaded={handleChaptersUploaded}
  />
{/if}
