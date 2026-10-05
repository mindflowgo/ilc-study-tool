import { json, error } from '@sveltejs/kit';
import { queueManager } from '$lib/server/queue';
import { LLMService, type LLMConfig } from '$lib/server/llm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const courseId = url.searchParams.get('courseId') || undefined;
  return json(queueManager.getStatus(courseId));
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const { action, courseId, lessonId, lessonTitle, tab, tabs, asNewVersion, prompt, customPrompt, customConfig } = body;

  if (customConfig) {
    LLMService.saveStoredConfig(customConfig as LLMConfig);
  }

  if (action === 'enqueue') {
    if (!courseId) {
      throw error(400, 'courseId is required to enqueue tasks');
    }

    if (lessonId) {
      const targetTabs = (tabs as Array<'summary' | 'cheatsheet' | 'test'>) || (tab ? [tab] : ['summary', 'cheatsheet', 'test']);
      const items = targetTabs.map((t) => ({
        courseId,
        lessonId,
        lessonTitle: lessonTitle || lessonId,
        tab: t,
        asNewVersion: Boolean(asNewVersion),
        customPrompt: customPrompt || prompt
      }));
      const enqueued = queueManager.enqueue(items, customConfig);
      return json({ success: true, enqueued, status: queueManager.getStatus(courseId) });
    } else {
      // Enqueue missing across the course
      const enqueued = queueManager.enqueueCourseMissing(courseId, tabs, customConfig);
      return json({ success: true, enqueued, status: queueManager.getStatus(courseId) });
    }
  }

  if (action === 'pause') {
    queueManager.pause();
    return json({ success: true, status: queueManager.getStatus(courseId) });
  }

  if (action === 'resume') {
    queueManager.resume();
    return json({ success: true, status: queueManager.getStatus(courseId) });
  }

  if (action === 'cancel') {
    queueManager.cancelAll(courseId);
    return json({ success: true, status: queueManager.getStatus(courseId) });
  }

  if (action === 'retry') {
    queueManager.retryFailed(courseId);
    return json({ success: true, status: queueManager.getStatus(courseId) });
  }

  throw error(400, `Unknown action: ${action}`);
};
