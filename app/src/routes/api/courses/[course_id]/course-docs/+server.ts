import { json, error } from '@sveltejs/kit';
import { CourseService } from '$lib/server/courses';
import { PromptService } from '$lib/server/prompts';
import { LLMService, type LLMConfig } from '$lib/server/llm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
  const courseId = params.course_id;
  const course = CourseService.getCourse(courseId);
  if (!course) {
    throw error(404, `Course '${courseId}' not found`);
  }

  const type = url.searchParams.get('type') as 'notes' | 'summary' | 'cheatsheet' | 'test' | null;

  if (type === 'notes') {
    const markdown = CourseService.buildAggregatedNotes(courseId);
    return json({ success: true, markdown });
  }

  if (type === 'summary' || type === 'cheatsheet' || type === 'test') {
    const markdown = CourseService.getCourseDocument(courseId, type);
    return json({
      success: true,
      exists: Boolean(markdown),
      markdown: markdown || ''
    });
  }

  return json({
    success: true,
    courseDocs: course.courseDocs || {
      summary: false,
      cheatsheet: false,
      test: false
    }
  });
};

export const POST: RequestHandler = async ({ params, request }) => {
  const courseId = params.course_id;
  const course = CourseService.getCourse(courseId);
  if (!course) {
    throw error(404, `Course '${courseId}' not found`);
  }

  const body = await request.json().catch(() => ({}));
  const type = body.type as 'summary' | 'cheatsheet' | 'test';
  const forceRegenerate = Boolean(body.forceRegenerate);

  if (!type || !['summary', 'cheatsheet', 'test'].includes(type)) {
    throw error(400, "Invalid type. Must be 'summary', 'cheatsheet', or 'test'");
  }

  // 1. If document already exists and not forced, return cached content immediately
  if (!forceRegenerate) {
    const existing = CourseService.getCourseDocument(courseId, type);
    if (existing && existing.trim().length > 0) {
      return json({
        success: true,
        cached: true,
        markdown: existing
      });
    }
  }

  // 2. Load system prompt template
  const promptId = `course_${type}`;
  let promptItem = PromptService.getPrompt(promptId);
  if (!promptItem) {
    promptItem = PromptService.getPrompt(type);
  }
  const systemPrompt = promptItem ? promptItem.content : '';

  // 3. Assemble lesson content payload across all units
  const payload = CourseService.buildAggregatedPayload(courseId, type);
  if (!payload || payload.trim().length < 50) {
    throw error(
      400,
      `No lesson ${type}s found to generate a course-level ${type}. Generate lesson ${type}s first.`
    );
  }

  // 4. Load active LLM config
  const config = (body.customConfig as LLMConfig) || LLMService.loadStoredConfig();
  if (!config || !config.baseUrl) {
    throw error(400, 'Active LLM configuration is required. Please configure your LLM settings.');
  }

  console.log(`[Course AI] Generating course.${type}.md for ${courseId.toUpperCase()} using model: ${config.model || 'default'}`);

  // 5. Invoke LLM
  try {
    const result = await LLMService.generateResult(config, systemPrompt, payload);
    const content = result.completion.trim();

    // 6. Save to disk
    CourseService.saveCourseDocument(courseId, type, content);

    console.log(`[Course AI] Saved course.${type}.md for ${courseId.toUpperCase()} (${content.length} chars)`);

    return json({
      success: true,
      cached: false,
      markdown: content,
      usage: result.usage
    });
  } catch (err: any) {
    console.error(`[Course AI] Failed to generate course.${type}.md:`, err);
    throw error(500, err?.message || `Failed to generate course ${type}`);
  }
};
