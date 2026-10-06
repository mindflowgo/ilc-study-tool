<script lang="ts">
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';
  import LessonSelector from '$lib/components/LessonSelector.svelte';
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte';
  import CodeMirrorEditor from '$lib/components/CodeMirrorEditor.svelte';
  import QuizRunner from '$lib/components/QuizRunner.svelte';
  import UploadModal from '$lib/components/UploadModal.svelte';
  import PromptCard, { type VersionItem } from '$lib/components/PromptCard.svelte';
  import ConfigureLLMModal from '$lib/components/ConfigureLLMModal.svelte';
  import SelectionToolbar from '$lib/components/SelectionToolbar.svelte';
  import DocumentViewerModal from '$lib/components/DocumentViewerModal.svelte';
  import { parseFrontmatter, serializeWithFrontmatter } from '$lib/parser/frontmatter';
  import { formatUserNote, insertAnnotationAfterText, removeAnnotation } from '$lib/parser/annotationInserter';
  import type { CourseManifest } from '$lib/parser/courseIngest';
  import type { LessonContentBundle, LessonFileVersion } from '$lib/server/courses';
  import { onMount, onDestroy } from 'svelte';
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
    Plus,
    X,
    RefreshCw,
    FileDown
  } from 'lucide-svelte';
  import { exportDocumentToPdf } from '$lib/pdf/exportPdf';

  let courseId = $derived($page.params.course_id);
  let course: CourseManifest | null = $state(null);
  let selectedLessonId: string = $state('');
  let activeTab: 'lesson' | 'summary' | 'cheatsheet' | 'test' = $state('lesson');
  let isEditing: boolean = $state(false);
  let isUploadModalOpen: boolean = $state(false);
  let uploadModalMode: 'add' | 'replace' = $state('add');
  let isLLMModalOpen: boolean = $state(false);
  let isGeneratingAI: boolean = $state(false);

  // Lesson bundle and generic prompt templates
  let lessonBundle: LessonContentBundle | null = $state(null);
  let genericPrompts: Record<string, string> = $state({});

  // Active version IDs for versioned tabs
  let activeVersions: Record<'summary' | 'cheatsheet' | 'test', string> = $state({
    summary: 'summary',
    cheatsheet: 'cheatsheet',
    test: 'test'
  });

  // Current tab contents (raw markdown including frontmatter)
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
  let isExportingPdf = $state(false);

  // Default prompt for active tab
  let defaultPromptForActiveTab = $derived.by(() => {
    if (activeTab === 'lesson') return '';
    return genericPrompts[activeTab] || '';
  });

  // Parsed frontmatter and markdown body for current tab
  let parsedActiveTab = $derived.by(() => {
    const raw = tabContents[activeTab] || '';
    return parseFrontmatter(raw, defaultPromptForActiveTab);
  });

  // Display name for active tab
  let tabDisplayName = $derived.by(() => {
    if (activeTab === 'summary') return 'Summary';
    if (activeTab === 'cheatsheet') return 'Cheatsheet';
    if (activeTab === 'test') return 'Practice Test';
    return '';
  });

  // Current list of versions for active tab
  let currentTabVersions = $derived.by((): VersionItem[] => {
    if (!lessonBundle || activeTab === 'lesson') return [];
    if (activeTab === 'summary') return lessonBundle.summaries;
    if (activeTab === 'cheatsheet') return lessonBundle.cheatsheets;
    if (activeTab === 'test') return lessonBundle.tests;
    return [];
  });

  let activeVersionId = $derived.by(() => {
    if (activeTab === 'lesson') return 'lesson';
    return activeVersions[activeTab] || currentTabVersions[0]?.id || activeTab;
  });

  // Check if current tab has unsaved changes
  let hasUnsavedChanges = $derived(
    tabContents[activeTab] !== originalContents[activeTab]
  );

  async function loadPrompts() {
    try {
      const res = await fetch('/api/prompts');
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        for (const p of data.prompts || []) {
          map[p.id] = p.content;
        }
        genericPrompts = map;
      }
    } catch (e) {
      console.warn('Failed to load prompts template:', e);
    }
  }

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

  async function loadLesson(lessonId: string, retainVersionTab?: { tab: 'summary' | 'cheatsheet' | 'test'; versionId: string }) {
    selectedLessonId = lessonId;
    isLoadingLesson = true;
    try {
      const res = await fetch(`/api/courses/${courseId}/${lessonId}`);
      if (res.ok) {
        const data: LessonContentBundle = await res.json();
        lessonBundle = data;

        // Set or retain active version IDs
        const summaryVer = retainVersionTab?.tab === 'summary'
          ? retainVersionTab.versionId
          : (data.summaries.find((v) => v.id === activeVersions.summary)?.id || data.summaries[0]?.id || 'summary');

        const cheatsheetVer = retainVersionTab?.tab === 'cheatsheet'
          ? retainVersionTab.versionId
          : (data.cheatsheets.find((v) => v.id === activeVersions.cheatsheet)?.id || data.cheatsheets[0]?.id || 'cheatsheet');

        const testVer = retainVersionTab?.tab === 'test'
          ? retainVersionTab.versionId
          : (data.tests.find((v) => v.id === activeVersions.test)?.id || data.tests[0]?.id || 'test');

        activeVersions = {
          summary: summaryVer,
          cheatsheet: cheatsheetVer,
          test: testVer
        };

        const activeSummaryContent = data.summaries.find((v) => v.id === summaryVer)?.content || data.summary || '';
        const activeCheatsheetContent = data.cheatsheets.find((v) => v.id === cheatsheetVer)?.content || data.cheatsheet || '';
        const activeTestContent = data.tests.find((v) => v.id === testVer)?.content || data.test || '';

        tabContents = {
          lesson: data.lesson || '',
          summary: activeSummaryContent,
          cheatsheet: activeCheatsheetContent,
          test: activeTestContent
        };
        originalContents = { ...tabContents };
      }
    } catch (e) {
      console.error('Failed to load lesson:', e);
    } finally {
      isLoadingLesson = false;
    }
  }

  function handleSelectVersion(versionId: string) {
    if (activeTab === 'lesson' || !lessonBundle) return;
    activeVersions[activeTab] = versionId;

    let versionsList: LessonFileVersion[] = [];
    if (activeTab === 'summary') versionsList = lessonBundle.summaries;
    else if (activeTab === 'cheatsheet') versionsList = lessonBundle.cheatsheets;
    else if (activeTab === 'test') versionsList = lessonBundle.tests;

    const found = versionsList.find((v) => v.id === versionId);
    if (found) {
      tabContents[activeTab] = found.content;
      originalContents[activeTab] = found.content;
    }
  }

  async function handleCreateNewVersion() {
    if (activeTab === 'lesson' || !selectedLessonId) return;

    const nextVer = (currentTabVersions.length > 0 ? Math.max(...currentTabVersions.map((v) => v.versionNumber)) : 0) + 1;
    const defaultPrompt = genericPrompts[activeTab] || '';

    let placeholderBody = `# ${currentLessonTitle} - ${tabDisplayName} (v${nextVer})\n\nClick "Re-generate with AI" above to generate study material using this prompt.`;
    if (activeTab === 'test') {
      placeholderBody = `# ${currentLessonTitle} - Practice Test (v${nextVer})\n\n## Questions\n01) [Knowledge & Understanding] Placeholder question.\n<Multiple-Choice>\n- [ ] Option A\n- [ ] Option B\n\n--\n\n## Answers\n01) A - (explanation) Placeholder answer. Click "Re-generate with AI" to generate curriculum questions.\n`;
    }

    const newContent = serializeWithFrontmatter(
      {
        prompt: defaultPrompt,
        type: activeTab,
        version: nextVer,
        updatedAt: new Date().toISOString().split('T')[0]
      },
      placeholderBody
    );

    try {
      const res = await fetch(`/api/courses/${courseId}/${selectedLessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: activeTab,
          content: newContent,
          asNewVersion: true
        })
      });

      if (res.ok) {
        const result = await res.json();
        await loadLesson(selectedLessonId, { tab: activeTab, versionId: result.versionId });
        saveSuccessMessage = `Created v${nextVer}!`;
        setTimeout(() => {
          saveSuccessMessage = '';
        }, 2000);
      }
    } catch (e) {
      console.error('Failed to create new version:', e);
    }
  }

  async function saveCurrentTab() {
    if (!selectedLessonId) return;
    isSaving = true;

    try {
      const targetTab = activeTab === 'lesson' ? 'lesson' : activeVersions[activeTab];
      const res = await fetch(`/api/courses/${courseId}/${selectedLessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: targetTab,
          content: tabContents[activeTab],
          asNewVersion: false
        })
      });

      if (res.ok) {
        originalContents[activeTab] = tabContents[activeTab];
        saveSuccessMessage = 'Saved!';
        setTimeout(() => {
          saveSuccessMessage = '';
        }, 2000);
        // Silently reload lesson bundle to sync versions
        const reloadRes = await fetch(`/api/courses/${courseId}/${selectedLessonId}`);
        if (reloadRes.ok) {
          lessonBundle = await reloadRes.json();
        }
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

  function handlePromptChange(newPrompt: string) {
    if (activeTab === 'lesson') return;
    const currentParsed = parsedActiveTab;
    const updatedFrontmatter = {
      ...currentParsed.frontmatter,
      prompt: newPrompt,
      updatedAt: new Date().toISOString().split('T')[0]
    };
    tabContents[activeTab] = serializeWithFrontmatter(updatedFrontmatter, currentParsed.body);
  }

  function handleBodyChange(newBody: string) {
    if (activeTab === 'lesson') {
      tabContents[activeTab] = newBody;
      return;
    }
    const currentParsed = parsedActiveTab;
    tabContents[activeTab] = serializeWithFrontmatter(currentParsed.frontmatter, newBody);
  }

  function getLocalLLMConfig() {
    if (typeof localStorage === 'undefined') return undefined;
    localStorage.removeItem('ilc_llm_apiKey');
    const baseUrl = localStorage.getItem('ilc_llm_baseUrl');
    if (!baseUrl) return undefined;
    return {
      provider: localStorage.getItem('ilc_llm_provider') || 'openai_compatible',
      baseUrl,
      authHeaderType: (localStorage.getItem('ilc_llm_authHeaderType') as any) || 'bearer',
      model: (localStorage.getItem('ilc_llm_model') ?? '').trim(),
      temperature: parseFloat(localStorage.getItem('ilc_llm_temp') || '0.3')
    };
  }

  async function triggerAIGeneration(asNewVersion: boolean = false) {
    if (activeTab === 'lesson') return;

    const localConfig = getLocalLLMConfig();
    if (!localConfig?.baseUrl) {
      isLLMModalOpen = true;
      return;
    }

    try {
      const activeSystemPrompt = parsedActiveTab.frontmatter.prompt || defaultPromptForActiveTab;

      console.log(`\n[ILC AI Enqueue: ${tabDisplayName}]`);
      console.log(`- Course: ${(courseId || '').toUpperCase()} | Lesson: ${selectedLessonId} (${currentLessonTitle})`);
      console.log(`- Endpoint: ${localConfig.baseUrl}`);
      console.log(`- Model: ${localConfig.model || '(server default)'}`);
      console.log(`- Mode: ${asNewVersion ? 'Save as new version' : 'Overwrite current'}`);
      console.log(`- System Prompt: "${activeSystemPrompt.slice(0, 120)}..."`);

      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enqueue',
          courseId,
          lessonId: selectedLessonId,
          lessonTitle: currentLessonTitle,
          tab: activeTab,
          asNewVersion,
          customPrompt: activeSystemPrompt,
          customConfig: localConfig
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[ILC AI Enqueue Error]`, errText);
        throw new Error(errText || 'Failed to queue generation task');
      }

      console.log(`[ILC AI Enqueue Success] ${tabDisplayName} task added to background queue.`);

      saveSuccessMessage = asNewVersion
        ? `✨ Queued new version of ${tabDisplayName}!`
        : `✨ Queued ${tabDisplayName} for generation!`;

      setTimeout(() => {
        saveSuccessMessage = '';
      }, 3500);
    } catch (err: any) {
      alert('AI Generation Queue Error: ' + (err?.message || 'Check your LLM configuration.'));
    }
  }

  let isQueueingMissing: boolean = $state(false);

  async function queueAllMissing() {
    if (!courseId) return;
    const localConfig = getLocalLLMConfig();
    if (!localConfig?.baseUrl) {
      isLLMModalOpen = true;
      return;
    }

    isQueueingMissing = true;
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enqueue',
          courseId,
          tabs: ['summary', 'cheatsheet', 'test'],
          customConfig: localConfig
        })
      });

      if (res.ok) {
        const data = await res.json();
        const count = data.enqueued?.length || 0;
        if (count > 0) {
          saveSuccessMessage = `✨ Queued ${count} missing item${count === 1 ? '' : 's'} for generation!`;
        } else {
          saveSuccessMessage = `All study items are already generated!`;
        }
        setTimeout(() => {
          saveSuccessMessage = '';
        }, 4000);
      } else {
        const errText = await res.text();
        throw new Error(errText || 'Failed to queue missing items');
      }
    } catch (err: any) {
      alert('Failed to queue missing items: ' + (err?.message || 'Check connection'));
    } finally {
      isQueueingMissing = false;
    }
  }

  let pendingAnnotationQuery: { selectedText: string; query: string } | null = $state(null);

  async function handleAnnotationSubmit(selectedText: string, query: string) {
    let provider = '';
    let baseUrl = '';
    let model = '';
    let authHeaderType: 'bearer' | 'api_key' | 'both' = 'bearer';
    let temperature = 0.3;

    if (typeof localStorage !== 'undefined') {
      provider = localStorage.getItem('ilc_llm_provider') || '';
      baseUrl = localStorage.getItem('ilc_llm_baseUrl') || '';
      model = localStorage.getItem('ilc_llm_model') || '';
      authHeaderType = (localStorage.getItem('ilc_llm_authHeaderType') as any) || 'bearer';
      temperature = parseFloat(localStorage.getItem('ilc_llm_temp') || '0.3');
    }

    if (!baseUrl) {
      pendingAnnotationQuery = { selectedText, query };
      isLLMModalOpen = true;
      return;
    }

    isGeneratingAI = true;

    try {
      const sessionId = `${courseId}-note`;
      const noteSystemPrompt =
        'You are an expert Ontario secondary school tutor. A student studying course material has highlighted a specific passage and asked a question. Provide a concise, clear, and insightful answer directly addressing the question in the context of the Ontario curriculum and lesson material. Emphasize key terms, legal doctrines, or definitions in bold. Keep the answer focused (1 to 3 short paragraphs or bullet points). Do not repeat the student query or include conversational filler.';

      const lessonContext = tabContents.lesson || tabContents[activeTab] || '';
      const userPrompt = `Course: ${course?.title || courseId}\nLesson: ${currentLessonTitle}\n\nSelected Passage to Explain:\n"${selectedText}"\n\nStudent's Question:\n"${query}"\n\nFull Reference Context:\n${lessonContext}`;

      console.log(`[ILC AI Note Request]`);
      console.log(`- Session ID: ${sessionId}`);
      console.log(`- Selected Excerpt: "${selectedText.slice(0, 100)}..."`);
      console.log(`- User Query: "${query}"`);
      console.log(`- User Prompt Length: ${userPrompt.length} characters`);

      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          config: {
            provider,
            baseUrl,
            authHeaderType,
            model,
            temperature,
            sessionId
          },
          sessionId,
          systemPrompt: noteSystemPrompt,
          userPrompt
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[ILC AI Note Error] Status: ${res.status}`, errText);
        throw new Error(errText || 'AI Note generation failed');
      }

      const data = await res.json();
      const aiAnswer = data.completion;
      const usageInfo = data.usage?.total_tokens !== undefined ? ` | "total_tokens":${data.usage.total_tokens}` : '';
      console.log(`[ILC AI Note Received] ${aiAnswer.length} characters${usageInfo}`);

      const formattedNote = formatUserNote(query, selectedText, aiAnswer);
      const currentContent = tabContents[activeTab] || '';
      const { updatedMarkdown, success } = insertAnnotationAfterText(
        currentContent,
        selectedText,
        formattedNote
      );

      if (success) {
        tabContents[activeTab] = updatedMarkdown;
        await saveCurrentTab();
        saveSuccessMessage = '✨ AI Note added!';
        setTimeout(() => {
          saveSuccessMessage = '';
        }, 3000);
      } else {
        alert('Could not locate the selected text in the document.');
      }
    } catch (err: any) {
      alert('AI Note Error: ' + (err?.message || 'Check your LLM configuration.'));
    } finally {
      isGeneratingAI = false;
      pendingAnnotationQuery = null;
    }
  }

  function handleDeleteNote(targetText: string, query: string) {
    const current = tabContents[activeTab] || '';
    const { updatedMarkdown, removed } = removeAnnotation(current, targetText || query);
    if (removed) {
      tabContents[activeTab] = updatedMarkdown;
      saveCurrentTab();
      saveSuccessMessage = 'Note removed';
      setTimeout(() => {
        saveSuccessMessage = '';
      }, 2000);
    }
  }

  function handleLLMConfigured() {
    if (pendingAnnotationQuery) {
      const q = pendingAnnotationQuery;
      pendingAnnotationQuery = null;
      handleAnnotationSubmit(q.selectedText, q.query);
    } else {
      triggerAIGeneration(false);
    }
  }

  function handleCancelEdit() {
    tabContents[activeTab] = originalContents[activeTab];
    isEditing = false;
  }

  async function handleSaveEdit() {
    await saveCurrentTab();
    isEditing = false;
  }

  async function handleExportPDF() {
    if (isExportingPdf || !course || !selectedLessonId) return;

    isExportingPdf = true;
    try {
      const activeVer = currentTabVersions.find((v) => v.id === activeVersionId);
      const exportTabName = activeTab === 'lesson' ? 'Course Notes' : tabDisplayName || activeTab;

      await exportDocumentToPdf({
        courseCode: course.id,
        courseTitle: course.title,
        lessonId: selectedLessonId,
        lessonTitle: currentLessonTitle || selectedLessonId,
        tab: activeTab,
        tabDisplayName: exportTabName,
        version: activeVer?.versionNumber,
        rawMarkdown: tabContents[activeTab]
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to generate PDF. Please check the browser console for details.');
    } finally {
      isExportingPdf = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (isEditing) {
        handleSaveEdit();
      } else {
        saveCurrentTab();
      }
    } else if (e.key === 'Escape' && isEditing) {
      handleCancelEdit();
    }
  }

  async function handleChaptersUploaded(uploadedCourseId: string) {
    await loadCourse();
    if (selectedLessonId) {
      await loadLesson(selectedLessonId);
    }
    saveSuccessMessage = uploadModalMode === 'replace' ? 'Chapter replaced!' : 'New chapters added!';
    setTimeout(() => {
      saveSuccessMessage = '';
    }, 3000);
  }

  // Full-page document / PDF viewer state
  let activeDocument: { url: string; title: string } | null = $state(null);

  function handleOpenDocument(url: string, title?: string) {
    activeDocument = { url, title: title || url.split('/').pop() || 'Document' };
    if (typeof window !== 'undefined') {
      window.history.pushState({ docViewerOpen: true }, '');
    }
  }

  function handleCloseDocument() {
    activeDocument = null;
    if (typeof window !== 'undefined' && window.history.state?.docViewerOpen) {
      window.history.back();
    }
  }

  function handlePopState() {
    if (activeDocument) {
      activeDocument = null;
    }
  }

  onMount(() => {
    loadPrompts();
    loadCourse();
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', handlePopState);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', handlePopState);
    }
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
  onLessonUpdated={(lId) => {
    if (lId === selectedLessonId) {
      loadLesson(selectedLessonId);
    }
  }}
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
          onSelectLesson={(id) => loadLesson(id)}
        />

        <div class="flex items-center space-x-1.5 shrink-0">
          <button
            onclick={() => { uploadModalMode = 'add'; isUploadModalOpen = true; }}
            class="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-medium text-stone-700 transition shadow-2xs cursor-pointer"
            title="Add new chapters / lessons to this course"
          >
            <Plus class="w-3.5 h-3.5 text-stone-500" />
            <span>Add</span>
          </button>

          <button
            onclick={() => { uploadModalMode = 'replace'; isUploadModalOpen = true; }}
            class="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-medium text-stone-700 transition shadow-2xs cursor-pointer"
            title="Replace current chapter ({currentLessonTitle || selectedLessonId}) with a new file upload"
          >
            <RefreshCw class="w-3.5 h-3.5 text-stone-500" />
            <span>Replace</span>
          </button>

          <button
            onclick={queueAllMissing}
            disabled={isQueueingMissing}
            class="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-medium text-amber-900 transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Scan course and queue all ungenerated study sheets (Summary, Cheatsheet, Test) in background"
          >
            {#if isQueueingMissing}
              <Loader2 class="w-3.5 h-3.5 text-amber-600 animate-spin" />
              <span>Queueing...</span>
            {:else}
              <Sparkles class="w-3.5 h-3.5 text-amber-600" />
              <span>Generate Missing</span>
            {/if}
          </button>
        </div>
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
    </div>

    <!-- Main Workspace Content Area -->
    <div class="flex-1 overflow-y-auto p-4 sm:p-8 max-w-5xl mx-auto w-full">
      {#if isLoadingLesson}
        <div class="h-64 flex items-center justify-center">
          <Loader2 class="w-6 h-6 animate-spin text-stone-300" />
        </div>
      {:else}
        <!-- Prompt Card with Version Switcher for Summary, Cheatsheet, Test (when not editing raw markdown) -->
        {#if activeTab !== 'lesson' && !isEditing}
          <PromptCard
            prompt={parsedActiveTab.frontmatter.prompt || defaultPromptForActiveTab}
            tabName={tabDisplayName}
            versions={currentTabVersions}
            {activeVersionId}
            isGenerating={isGeneratingAI}
            onChangePrompt={handlePromptChange}
            onRegenerate={triggerAIGeneration}
            onSelectVersion={handleSelectVersion}
            onCreateNewVersion={handleCreateNewVersion}
            onResetPrompt={() => handlePromptChange(defaultPromptForActiveTab)}
          />
        {/if}

        <!-- Top-Right Action Controls (Sticky): direct child of the scroll
             container. Negative top offsets cancel the container's py padding
             (p-4 = 16px, sm:p-8 = 32px) so the row pins ~2px below the
             header line instead of 16-32px down. -->
        <div class="sticky -top-[14px] sm:-top-[30px] z-30 flex justify-end px-8 sm:px-12 pt-0.5 mt-1 -mb-[30px] pointer-events-none">
          <div class="pointer-events-auto flex items-center space-x-2">
            {#if isEditing}
              <button
                onclick={handleCancelEdit}
                class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-stone-200/90 bg-white/95 backdrop-blur-sm hover:bg-white text-xs font-medium text-stone-700 transition shadow-xs hover:shadow-sm cursor-pointer"
                title="Discard changes and exit edit mode (Esc)"
              >
                <X class="w-3.5 h-3.5 text-stone-500" />
                <span>Cancel</span>
              </button>

              <button
                onclick={handleSaveEdit}
                disabled={isSaving}
                class="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900/95 backdrop-blur-sm hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-medium transition shadow-xs hover:shadow-sm cursor-pointer"
                title="Save changes to file (⌘+S)"
              >
                {#if isSaving}
                  <Loader2 class="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                {:else if saveSuccessMessage}
                  <Check class="w-3.5 h-3.5 text-emerald-400" />
                  <span class="text-emerald-400 font-semibold">{saveSuccessMessage}</span>
                {:else}
                  <Save class="w-3.5 h-3.5" />
                  <span>Save</span>
                {/if}
              </button>
            {:else}
              <button
                onclick={handleExportPDF}
                disabled={isExportingPdf}
                class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-stone-200/90 bg-white/95 backdrop-blur-sm hover:bg-white text-xs font-medium text-stone-700 hover:text-stone-900 shadow-xs hover:shadow-sm transition cursor-pointer disabled:opacity-50"
                title="Generate and download PDF for this document"
              >
                {#if isExportingPdf}
                  <Loader2 class="w-3.5 h-3.5 animate-spin text-stone-500" />
                  <span>PDF...</span>
                {:else}
                  <FileDown class="w-3.5 h-3.5 text-stone-500" />
                  <span>PDF</span>
                {/if}
              </button>

              <button
                onclick={() => (isEditing = true)}
                class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-stone-200/90 bg-white/95 backdrop-blur-sm hover:bg-white text-xs font-medium text-stone-700 hover:text-stone-900 shadow-xs hover:shadow-sm transition cursor-pointer"
                title="Edit content"
              >
                <Edit3 class="w-3.5 h-3.5 text-stone-500" />
                <span>Edit</span>
              </button>
            {/if}
          </div>
        </div>

        <!-- Main Card -->
        <div class="relative bg-white rounded-2xl border border-stone-200 shadow-2xs group">

          {#if isEditing}
            <!-- CodeMirror Editor (direct raw markdown with YAML frontmatter) -->
            <div class="p-4 sm:p-6 pt-16">
              <div class="h-[calc(100vh-16rem)]">
                <CodeMirrorEditor
                  value={tabContents[activeTab]}
                  courseId={course.id}
                  onChange={handleEditorChange}
                  onSave={handleSaveEdit}
                />
              </div>
            </div>
          {:else if activeTab === 'test'}
            <!-- Practice Test Interactive Runner -->
            <div class="p-6 sm:p-10">
              <QuizRunner
                testMarkdown={parsedActiveTab.body}
              />
            </div>
          {:else}
            <!-- Markdown Reader View -->
            <article class="p-6 sm:p-10">
              <MarkdownViewer
                markdown={parsedActiveTab.body}
                courseId={course.id}
                onDeleteNote={handleDeleteNote}
                onOpenDocument={handleOpenDocument}
              />
            </article>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if !isEditing}
    <SelectionToolbar
      containerSelector=".markdown-body"
      isGenerating={isGeneratingAI}
      onSubmitQuery={handleAnnotationSubmit}
    />
  {/if}

  {#if activeDocument}
    <DocumentViewerModal
      url={activeDocument.url}
      title={activeDocument.title}
      courseTitle={course.title}
      onClose={handleCloseDocument}
    />
  {/if}

  <UploadModal
    isOpen={isUploadModalOpen}
    presetCourseId={course.id}
    mode={uploadModalMode}
    targetLessonId={selectedLessonId}
    targetLessonTitle={currentLessonTitle}
    onClose={() => (isUploadModalOpen = false)}
    onUploaded={handleChaptersUploaded}
  />

  <ConfigureLLMModal
    isOpen={isLLMModalOpen}
    onClose={() => (isLLMModalOpen = false)}
    onConfigured={handleLLMConfigured}
  />
{/if}
