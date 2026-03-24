import type { Task, TaskState, Message, Part } from "@a2a-js/sdk";

/** Default TTL for completed tasks: 1 hour */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Default processing timeout for working tasks: 5 minutes */
const DEFAULT_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

export const TERMINAL_STATES = new Set<string>([
  "completed",
  "failed",
  "canceled",
  "rejected",
]);

/**
 * Internal task record — tracks a task's lifecycle and maps to AgentService conversations
 */
export interface TaskRecord {
  task: Task;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  /** Timestamp when task entered "working" state (for stale detection) */
  workingStartedAt?: string;
}

/**
 * TaskManager — manages A2A task lifecycle
 *
 * Each task maps 1:1 to an AgentService conversation.
 * Tasks move through states: submitted → working → completed/failed/canceled
 *
 * Terminal tasks are evicted after a configurable TTL (default: 1 hour).
 */
export class TaskManager {
  private tasks = new Map<string, TaskRecord>();
  private readonly ttlMs: number;
  private readonly processingTimeoutMs: number;

  constructor(
    ttlMs: number = DEFAULT_TTL_MS,
    processingTimeoutMs: number = DEFAULT_PROCESSING_TIMEOUT_MS,
  ) {
    this.ttlMs = ttlMs;
    this.processingTimeoutMs = processingTimeoutMs;
  }

  /**
   * Evict terminal tasks whose updatedAt exceeds the TTL
   */
  private evictExpired(): void {
    const now = Date.now();
    for (const [id, record] of this.tasks) {
      if (
        TERMINAL_STATES.has(record.task.status.state) &&
        now - new Date(record.updatedAt).getTime() >= this.ttlMs
      ) {
        this.tasks.delete(id);
      }
    }
  }

  /**
   * Create a new task from an incoming message
   */
  createTask(messageText: string, contextId?: string): TaskRecord {
    this.evictExpired();
    const taskId = crypto.randomUUID();
    const resolvedContextId = contextId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const userMessage: Message = {
      kind: "message",
      messageId: crypto.randomUUID(),
      role: "user",
      parts: [{ kind: "text", text: messageText }],
      contextId: resolvedContextId,
      taskId,
    };

    const task: Task = {
      id: taskId,
      contextId: resolvedContextId,
      kind: "task",
      status: {
        state: "submitted",
        timestamp: now,
      },
      history: [userMessage],
    };

    const record: TaskRecord = {
      task,
      conversationId: `a2a:${taskId}`,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(taskId, record);
    return record;
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Update task state with optional agent response message
   */
  updateState(
    taskId: string,
    state: TaskState,
    messageText?: string,
  ): TaskRecord | undefined {
    const record = this.tasks.get(taskId);
    if (!record) return undefined;

    const now = new Date().toISOString();
    record.task.status = {
      state,
      timestamp: now,
    };
    record.updatedAt = now;

    if (state === "working") {
      record.workingStartedAt = now;
    }

    if (messageText) {
      const agentMessage: Message = {
        kind: "message",
        messageId: crypto.randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text: messageText }],
        contextId: record.task.contextId,
        taskId,
      };

      record.task.status.message = agentMessage;

      record.task.history ??= [];
      record.task.history.push(agentMessage);
    }

    return record;
  }

  /**
   * Add artifacts to a task
   */
  addArtifact(
    taskId: string,
    name: string,
    parts: Part[],
  ): TaskRecord | undefined {
    const record = this.tasks.get(taskId);
    if (!record) return undefined;

    record.task.artifacts ??= [];
    record.task.artifacts.push({
      artifactId: crypto.randomUUID(),
      name,
      parts,
    });

    record.updatedAt = new Date().toISOString();
    return record;
  }

  /**
   * Get task with limited history (per A2A spec historyLength parameter)
   */
  getTaskWithHistory(taskId: string, historyLength?: number): Task | undefined {
    const record = this.tasks.get(taskId);
    if (!record) return undefined;

    // Auto-fail stale working tasks
    if (
      record.task.status.state === "working" &&
      record.workingStartedAt &&
      Date.now() - new Date(record.workingStartedAt).getTime() >=
        this.processingTimeoutMs
    ) {
      this.updateState(taskId, "failed", "Processing timed out");
    }

    if (historyLength === undefined || !record.task.history) {
      return record.task;
    }

    return {
      ...record.task,
      history: record.task.history.slice(-historyLength),
    };
  }

  /**
   * Remove a task
   */
  deleteTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /**
   * Total task count
   */
  get size(): number {
    return this.tasks.size;
  }
}
