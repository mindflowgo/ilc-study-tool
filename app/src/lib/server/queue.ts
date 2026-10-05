import fs from 'node:fs';
import path from 'node:path';
import { LLMService, type LLMConfig } from './llm';
import { PromptService } from './prompts';
import { CourseService } from './courses';
import { serializeWithFrontmatter } from '../parser/frontmatter';

export interface GenerationTask {
  id: string; // e.g. "gwl3o:01.01:summary"
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  tab: 'summary' | 'cheatsheet' | 'test';
  asNewVersion?: boolean;
  customPrompt?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  tokensUsed?: number;
}

export interface QueueLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface QueueStatus {
  isRunning: boolean;
  isPaused: boolean;
  activeTask: GenerationTask | null;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
  totalTasks: number;
  tasks: GenerationTask[];
  recentLogs: QueueLogEntry[];
}

class GenerationQueue {
  private tasks: Map<string, GenerationTask> = new Map();
  private recentLogs: QueueLogEntry[] = [];
  private isProcessing = false;
  private isPaused = false;
  private activeTaskId: string | null = null;

  addLog(level: 'info' | 'warn' | 'error', message: string) {
    const entry: QueueLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      message
    };
    this.recentLogs.push(entry);
    if (this.recentLogs.length > 80) {
      this.recentLogs.shift();
    }

    if (level === 'error') {
      console.error(`[Queue ${entry.timestamp.slice(11, 19)}] ${message}`);
    } else if (level === 'warn') {
      console.warn(`[Queue ${entry.timestamp.slice(11, 19)}] ${message}`);
    } else {
      console.log(`[Queue ${entry.timestamp.slice(11, 19)}] ${message}`);
    }
  }

  private makeId(courseId: string, lessonId: string, tab: string, asNewVersion?: boolean): string {
    if (asNewVersion) {
      return `${courseId.toLowerCase()}:${lessonId}:${tab}:new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }
    return `${courseId.toLowerCase()}:${lessonId}:${tab}`;
  }

  /**
   * Enqueue specific tasks
   */
  enqueue(
    items: Array<{
      courseId: string;
      lessonId: string;
      lessonTitle?: string;
      tab: 'summary' | 'cheatsheet' | 'test';
      asNewVersion?: boolean;
      customPrompt?: string;
    }>,
    customConfig?: LLMConfig
  ): GenerationTask[] {
    const enqueued: GenerationTask[] = [];

    if (customConfig) {
      LLMService.saveStoredConfig(customConfig);
    }

    for (const item of items) {
      const id = this.makeId(item.courseId, item.lessonId, item.tab, item.asNewVersion);
      const existing = this.tasks.get(id);

      // If already pending or processing (and not a new version request), don't duplicate
      if (existing && (existing.status === 'pending' || existing.status === 'processing') && !item.asNewVersion) {
        continue;
      }

      const task: GenerationTask = {
        id,
        courseId: item.courseId.toLowerCase(),
        lessonId: item.lessonId,
        lessonTitle: item.lessonTitle || item.lessonId,
        tab: item.tab,
        asNewVersion: item.asNewVersion,
        customPrompt: item.customPrompt,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      this.tasks.set(id, task);
      enqueued.push(task);
    }

    this.triggerProcessing();
    return enqueued;
  }

  /**
   * Automatically scan a course and enqueue tasks for any missing / ungenerated tabs
   */
  enqueueCourseMissing(
    courseId: string,
    tabs: Array<'summary' | 'cheatsheet' | 'test'> = ['summary', 'cheatsheet', 'test'],
    customConfig?: LLMConfig
  ): GenerationTask[] {
    const manifest = CourseService.getManifest(courseId);
    if (!manifest) return [];

    if (customConfig) {
      LLMService.saveStoredConfig(customConfig);
    }

    const tasksToEnqueue: Array<{
      courseId: string;
      lessonId: string;
      lessonTitle: string;
      tab: 'summary' | 'cheatsheet' | 'test';
    }> = [];

    const courseDir = path.join(CourseService.getCoursesDir(), courseId.toLowerCase());

    for (const unit of manifest.units) {
      for (const lesson of unit.lessons) {
        for (const tab of tabs) {
          const filePath = path.join(courseDir, `${lesson.id}.${tab}.md`);
          let isMissingOrPlaceholder = true;

          if (fs.existsSync(filePath)) {
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              // If it has substantial text and does not say "*Not yet generated.*"
              if (content.length > 250 && !content.includes('*Not yet generated.*') && !content.includes('Not yet generated')) {
                isMissingOrPlaceholder = false;
              }
            } catch {}
          }

          if (isMissingOrPlaceholder) {
            tasksToEnqueue.push({
              courseId,
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              tab
            });
          }
        }
      }
    }

    return this.enqueue(tasksToEnqueue, customConfig);
  }

  /**
   * Get current queue state
   */
  getStatus(courseId?: string): QueueStatus {
    const all = Array.from(this.tasks.values());
    const filtered = courseId ? all.filter((t) => t.courseId === courseId.toLowerCase()) : all;

    const activeTask = this.activeTaskId ? this.tasks.get(this.activeTaskId) || null : null;
    const pendingCount = filtered.filter((t) => t.status === 'pending').length;
    const completedCount = filtered.filter((t) => t.status === 'completed').length;
    const failedCount = filtered.filter((t) => t.status === 'failed').length;

    return {
      isRunning: this.isProcessing,
      isPaused: this.isPaused,
      activeTask,
      pendingCount,
      completedCount,
      failedCount,
      totalTasks: filtered.length,
      tasks: filtered.slice(-50).reverse(), // Return recent 50
      recentLogs: this.recentLogs.slice(-40)
    };
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    this.triggerProcessing();
  }

  cancelAll(courseId?: string): void {
    if (courseId) {
      for (const [id, task] of this.tasks.entries()) {
        if (task.courseId === courseId.toLowerCase() && task.status === 'pending') {
          this.tasks.delete(id);
        }
      }
    } else {
      for (const [id, task] of this.tasks.entries()) {
        if (task.status === 'pending') {
          this.tasks.delete(id);
        }
      }
    }
  }

  retryFailed(courseId?: string): void {
    for (const task of this.tasks.values()) {
      if ((!courseId || task.courseId === courseId.toLowerCase()) && task.status === 'failed') {
        task.status = 'pending';
        task.error = undefined;
      }
    }
    this.triggerProcessing();
  }

  private triggerProcessing(): void {
    if (this.isProcessing || this.isPaused) return;
    this.processNext().catch((err) => {
      console.error('[GenerationQueue Worker Error]', err);
    });
  }

  private async processNext(): Promise<void> {
    if (this.isPaused) return;

    // Find next pending task
    let nextTask: GenerationTask | null = null;
    for (const task of this.tasks.values()) {
      if (task.status === 'pending') {
        nextTask = task;
        break;
      }
    }

    if (!nextTask) {
      this.isProcessing = false;
      this.activeTaskId = null;
      return;
    }

    this.isProcessing = true;
    this.activeTaskId = nextTask.id;
    nextTask.status = 'processing';
    nextTask.startedAt = new Date().toISOString();

    try {
      const config = LLMService.loadStoredConfig();
      if (!config || !config.baseUrl) {
        throw new Error('LLM not configured. Please open Settings or AI configuration modal to set up API endpoint.');
      }

      const bundle = CourseService.getLessonBundle(nextTask.courseId, nextTask.lessonId);
      if (!bundle || !bundle.lesson) {
        throw new Error(`Lesson file not found for ${nextTask.courseId} / ${nextTask.lessonId}`);
      }

      // Load prompt template
      let systemPrompt = nextTask.customPrompt;
      if (!systemPrompt) {
        let promptKey = nextTask.tab;
        let promptItem = PromptService.getPrompt(promptKey);
        if (!promptItem && nextTask.tab === 'test') {
          promptItem = PromptService.getPrompt('test_kica');
        }

        systemPrompt =
          promptItem?.content ||
          `You are an expert Ontario curriculum educator. Produce a high quality ${nextTask.tab} in Markdown format.`;
      }

      const userPrompt = `Course: ${nextTask.courseId.toUpperCase()}\nLesson: ${nextTask.lessonTitle}\n\nFull Lesson Material:\n${bundle.lesson}`;

      // Use the CURRENT active settings: clean model (blank if not specified) and session_id
      const effectiveConfig: LLMConfig = {
        ...config,
        model: config.model ? config.model.trim() : '',
        sessionId: config.sessionId || `${nextTask.courseId}-${nextTask.tab}`
      };

      const systemPreview = systemPrompt.length > 250 ? systemPrompt.slice(0, 250) + '...' : systemPrompt;
      const userPreview = userPrompt.length > 250 ? userPrompt.slice(0, 250) + '...' : userPrompt;

      this.addLog(
        'info',
        `\n=================== [ILC AI Request: ${nextTask.tab.toUpperCase()}] ===================\n` +
        `Course:      ${nextTask.courseId.toUpperCase()} | Lesson: ${nextTask.lessonId} ("${nextTask.lessonTitle}")\n` +
        `Endpoint:    ${effectiveConfig.baseUrl}\n` +
        `Model:       ${effectiveConfig.model || '(server default)'}\n` +
        `Session ID:  ${effectiveConfig.sessionId}\n` +
        `Auth Header: ${effectiveConfig.apiKey ? (effectiveConfig.authHeaderType === 'api_key' ? 'api-key: ***' : 'Bearer ***') : 'None'}\n` +
        `System Prompt Preview:\n${systemPreview}\n\n` +
        `User Prompt Length: ${userPrompt.length.toLocaleString()} chars (~${Math.round(userPrompt.length / 4).toLocaleString()} tokens)\n` +
        `User Prompt Preview:\n${userPreview}\n` +
        `========================================================================`
      );

      const result = await LLMService.generateResult(effectiveConfig, systemPrompt, userPrompt);

      // Serialize with YAML frontmatter
      const frontmatter = {
        prompt: systemPrompt,
        type: nextTask.tab,
        version: 1,
        updatedAt: new Date().toISOString().split('T')[0]
      };

      const finalMarkdown = serializeWithFrontmatter(frontmatter, result.completion);

      // Save to disk
      CourseService.saveLessonTab(nextTask.courseId, nextTask.lessonId, nextTask.tab, finalMarkdown, {
        asNewVersion: nextTask.asNewVersion
      });

      nextTask.status = 'completed';
      nextTask.completedAt = new Date().toISOString();
      nextTask.tokensUsed = result.usage?.total_tokens;

      const tokensInfo = result.usage?.total_tokens !== undefined ? ` (tokens: ${result.usage.total_tokens})` : '';
      this.addLog(
        'info',
        `[ILC AI Received: ${nextTask.tab.toUpperCase()}] ${nextTask.lessonId}: Generated ${result.completion.length.toLocaleString()} characters${tokensInfo}\n`
      );
    } catch (err: any) {
      nextTask.status = 'failed';
      nextTask.error = err?.message || 'Generation failed';
      this.addLog(
        'error',
        `[ILC AI Error: ${nextTask.tab.toUpperCase()}] ${nextTask.lessonId}: ${err?.message || 'Generation failed'}`
      );
    } finally {
      this.activeTaskId = null;
      // Small breather between LLM calls to avoid aggressive rate-limits
      setTimeout(() => {
        this.processNext().catch(() => {});
      }, 300);
    }
  }
}

export const queueManager = new GenerationQueue();
