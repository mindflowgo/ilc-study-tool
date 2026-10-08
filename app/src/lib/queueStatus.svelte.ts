import { apiFetch } from '$lib/api';
import type { GenerationTask, QueueLogEntry, QueueStatus } from '$lib/server/queue';

const EMPTY_STATUS: QueueStatus = {
  isRunning: false,
  isPaused: false,
  activeTask: null,
  pendingCount: 0,
  completedCount: 0,
  failedCount: 0,
  totalTasks: 0,
  tasks: [],
  recentLogs: []
};

const BUSY_INTERVAL = 2000;
const IDLE_INTERVAL = 8000;
const OFFLINE_INTERVAL = 15000;

export type QueueTaskListener = (task: GenerationTask) => void;

/**
 * Single source of queue state for the UI.
 *
 * The queue is one global worker in the backend process, so this polls once for
 * everyone and every consumer reads the same snapshot. Callers register with
 * `acquire()` (which returns its own teardown) rather than starting their own
 * interval, and use `apiFetch` so polling resolves to the right origin in dev,
 * preview, and the packaged desktop build alike.
 */
class QueueStatusStore {
  status = $state<QueueStatus>(EMPTY_STATUS);
  /** Flipped once polling fails repeatedly, so the UI can say so instead of claiming "All tasks completed". */
  reachable = $state(true);

  private consumers = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private failures = 0;
  private seeded = false;
  private reportedRunKeys = new Set<string>();
  private printedLogIds = new Set<string>();
  private listeners = new Set<QueueTaskListener>();

  /** Start polling for as long as the caller is alive. Returns the release function. */
  acquire(): () => void {
    this.consumers += 1;
    if (this.consumers === 1) {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.handleVisibility);
      }
      this.schedule(0);
    }
    return () => this.release();
  }

  /** Subscribe to tasks that just finished. Returns the unsubscribe function. */
  onTaskFinished(listener: QueueTaskListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Force an immediate poll (used after enqueueing / queue actions). */
  async refresh(): Promise<void> {
    await this.poll();
  }

  private release(): void {
    this.consumers = Math.max(0, this.consumers - 1);
    if (this.consumers > 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.schedule(0);
    }
  };

  private schedule(delay: number): void {
    if (this.consumers === 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.poll();
    }, delay);
  }

  private nextDelay(): number {
    if (!this.reachable) return OFFLINE_INTERVAL;
    if (this.status.pendingCount > 0 || this.status.activeTask) return BUSY_INTERVAL;
    return IDLE_INTERVAL;
  }

  private async poll(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        // Don't churn the backend while the window is backgrounded; try again later.
        this.schedule(this.nextDelay());
        return;
      }

      const res = await apiFetch('/api/queue');
      if (!res.ok) throw new Error(`Queue status request failed (${res.status})`);

      const data: QueueStatus = await res.json();
      const firstPoll = !this.seeded;
      this.seeded = true;

      this.printLogs(data.recentLogs || [], firstPoll);
      this.status = data;

      this.failures = 0;
      this.reachable = true;

      this.emitFinished(data.tasks || [], firstPoll);
    } catch (e) {
      this.failures += 1;
      if (this.failures >= 2) {
        this.reachable = false;
      }
    } finally {
      this.inFlight = false;
      this.schedule(this.nextDelay());
    }
  }

  /**
   * Notify subscribers about each task run that reached a terminal state since
   * the previous poll. The key is the task id *plus* its start time: overwrite
   * requests reuse a task id across runs, and each run needs its own callback.
   * The first poll only seeds state — otherwise every finished task from earlier
   * in the session would fire a spurious refresh.
   */
  private emitFinished(tasks: GenerationTask[], seedOnly: boolean): void {
    for (const task of tasks) {
      if (task.status !== 'completed' && task.status !== 'failed') continue;
      const runKey = `${task.id}@${task.startedAt || task.createdAt}`;
      if (this.reportedRunKeys.has(runKey)) continue;
      this.reportedRunKeys.add(runKey);
      if (seedOnly) continue;
      for (const listener of this.listeners) {
        try {
          listener(task);
        } catch (err) {
          console.error('[QueueStatus] listener failed:', err);
        }
      }
    }
    if (this.reportedRunKeys.size > 200) {
      this.reportedRunKeys = new Set(Array.from(this.reportedRunKeys).slice(-100));
    }
  }

  /** Mirror backend queue logs into the browser console so requests are visible even with the popover closed. */
  private printLogs(logs: QueueLogEntry[], seedOnly: boolean): void {
    for (const log of logs) {
      if (this.printedLogIds.has(log.id)) continue;
      this.printedLogIds.add(log.id);
      if (seedOnly) continue;
      if (log.level === 'error') console.error(log.message);
      else if (log.level === 'warn') console.warn(log.message);
      else console.log(log.message);
    }
    // Bound memory for long sessions.
    if (this.printedLogIds.size > 200) {
      this.printedLogIds = new Set(Array.from(this.printedLogIds).slice(-100));
    }
  }
}

export const queueStatus = new QueueStatusStore();
