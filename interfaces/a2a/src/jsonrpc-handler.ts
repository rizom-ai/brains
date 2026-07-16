import { z } from "@brains/utils/zod";
import type { AgentNamespace } from "@brains/plugins";
import type { UserPermissionLevel } from "@brains/templates";
import type { Task } from "@a2a-js/sdk";
import { TERMINAL_STATES, type TaskManager } from "./task-manager";
import type { A2ATurnSupervisor } from "./turn-supervisor";

const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

// -- Zod schemas for request validation --

interface MessagePartParams {
  kind: string;
  text?: string | undefined;
  data?: Record<string, unknown> | undefined;
}

const messagePartsSchema: z.ZodType<MessagePartParams[], MessagePartParams[]> =
  z.array(
    z.object({
      kind: z.string(),
      text: z.string().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    }),
  );

const sendMessageParamsSchema = z.object({
  message: z.object({
    kind: z.literal("message").optional(),
    messageId: z.string().optional(),
    role: z.enum(["user", "agent"]).optional(),
    parts: messagePartsSchema,
    contextId: z.string().optional(),
    taskId: z.string().optional(),
  }),
  configuration: z
    .object({
      historyLength: z.number().optional(),
    })
    .optional(),
});

const taskIdParamsSchema = z.object({
  id: z.string(),
  historyLength: z.number().optional(),
});

// -- Response builders --

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number;
  result: Task;
  error?: never;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: never;
  error: { code: number; message: string };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

function successResponse(id: string | number, result: Task): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// -- JSON-RPC request envelope --

export interface JsonRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: Record<string, unknown> | undefined;
}

export type JsonRpcRequestInput = JsonRpcRequest;

export const jsonrpcRequestSchema: z.ZodType<
  JsonRpcRequest,
  JsonRpcRequestInput
> = z.object({
  jsonrpc: z.string(),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

// -- Handler context --

export interface JsonRpcHandlerContext {
  taskManager: TaskManager;
  turnSupervisor: A2ATurnSupervisor;
  agentService: AgentNamespace;
  callerPermissionLevel: UserPermissionLevel;
  /** Verified caller domain for signed A2A requests; null/undefined for anonymous callers. */
  callerDomain?: string | null;
}

// -- Main handler --

/**
 * Handle a parsed JSON-RPC 2.0 request and dispatch to the appropriate method.
 */
export async function handleJsonRpc(
  request: JsonRpcRequest,
  context: JsonRpcHandlerContext,
): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  switch (method) {
    case "message/send":
      return handleSendMessage(id, params ?? {}, context);
    case "tasks/get":
      return handleGetTask(id, params ?? {}, context);
    case "tasks/cancel":
      return handleCancelTask(id, params ?? {}, context);
    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}

// -- Method handlers --

async function handleSendMessage(
  id: string | number,
  params: Record<string, unknown>,
  context: JsonRpcHandlerContext,
): Promise<JsonRpcResponse> {
  const parsed = sendMessageParamsSchema.safeParse(params);
  if (!parsed.success) {
    return errorResponse(id, -32602, `Invalid params: ${parsed.error.message}`);
  }

  // Extract text from parts
  const textParts = parsed.data.message.parts.filter(
    (p): p is { kind: "text"; text: string } =>
      p.kind === "text" && typeof p.text === "string",
  );

  if (textParts.length === 0) {
    return errorResponse(
      id,
      -32602,
      "Message must contain at least one text part",
    );
  }

  const messageText = textParts.map((p) => p.text).join("\n");
  const contextId = parsed.data.message.contextId;
  const callerDomain = context.callerDomain ?? null;
  const messageId = callerDomain ? parsed.data.message.messageId : undefined;

  const existing = context.taskManager.getTaskByClientMessageId(
    callerDomain,
    messageId,
  );
  if (existing) {
    return successResponse(id, existing.task);
  }

  // Create task and move to working
  const record = context.taskManager.createTask(messageText, contextId, {
    callerDomain,
    messageId,
  });
  const taskId = record.task.id;
  context.taskManager.updateState(taskId, "working");

  // Fire agent processing in background, return "working" immediately.
  // Caller polls tasks/get until completion.
  processInBackground(taskId, messageText, record.conversationId, context);

  const workingRecord = context.taskManager.getTask(taskId);
  if (!workingRecord) {
    return errorResponse(id, -32603, "Internal error: task disappeared");
  }

  return successResponse(id, workingRecord.task);
}

/** Start a polling task whose lifetime is owned by the interface supervisor. */
function processInBackground(
  taskId: string,
  messageText: string,
  conversationId: string,
  context: JsonRpcHandlerContext,
): void {
  context.turnSupervisor.start(
    taskId,
    async (signal) => {
      try {
        const agentResponse = await context.agentService.chat(
          messageText,
          conversationId,
          {
            userPermissionLevel: context.callerPermissionLevel,
            interfaceType: "a2a",
          },
          signal,
        );
        if (signal.aborted || isTaskCanceled(taskId, context.taskManager)) {
          return;
        }
        context.taskManager.updateState(
          taskId,
          "completed",
          agentResponse.text,
        );
      } catch (error) {
        if (signal.aborted) return;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        context.taskManager.updateState(
          taskId,
          "failed",
          `Error: ${errorMessage}`,
        );
      }
    },
    {
      onCancel: () => {
        context.taskManager.updateState(taskId, "canceled");
      },
    },
  );
}

function isTaskCanceled(taskId: string, taskManager: TaskManager): boolean {
  return taskManager.getTask(taskId)?.task.status.state === "canceled";
}

// -- Streaming (SSE) handler --

export interface StreamParams {
  message: {
    kind: string;
    messageId?: string | undefined;
    parts: MessagePartParams[];
    contextId?: string | undefined;
  };
}

export type StreamParamsInput = StreamParams;

export const streamParamsSchema: z.ZodType<StreamParams, StreamParamsInput> =
  z.object({
    message: z.object({
      kind: z.string(),
      messageId: z.string().optional(),
      parts: messagePartsSchema,
      contextId: z.string().optional(),
    }),
  });

interface StreamResult {
  taskId: string;
  stream: ReadableStream<Uint8Array>;
}

interface StreamOptions {
  heartbeatIntervalMs?: number;
}

/**
 * Handle message/stream — returns an SSE stream of task status updates.
 * Creates a task, starts processing, and streams events until terminal state.
 * Each SSE event is wrapped in a JSON-RPC 2.0 response envelope.
 */
export function handleStreamMessage(
  requestId: string | number,
  message: StreamParams["message"],
  context: JsonRpcHandlerContext,
  options: StreamOptions = {},
): StreamResult | JsonRpcError {
  const textParts = message.parts.filter(
    (p): p is { kind: "text"; text: string } =>
      p.kind === "text" && typeof p.text === "string",
  );

  if (textParts.length === 0) {
    return errorResponse(
      requestId,
      -32602,
      "Message must contain at least one text part",
    );
  }

  const messageText = textParts.map((p) => p.text).join("\n");
  const callerDomain = context.callerDomain ?? null;
  const messageId = callerDomain ? message.messageId : undefined;

  const existing = context.taskManager.getTaskByClientMessageId(
    callerDomain,
    messageId,
  );
  if (existing) {
    return {
      taskId: existing.task.id,
      stream: taskSnapshotStream(requestId, existing.task),
    };
  }

  const record = context.taskManager.createTask(
    messageText,
    message.contextId,
    {
      callerDomain,
      messageId,
    },
  );
  const taskId = record.task.id;

  context.taskManager.updateState(taskId, "working");

  const encoder = new TextEncoder();
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? SSE_HEARTBEAT_INTERVAL_MS;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller): void {
      function sendRaw(payload: string): void {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
          context.turnSupervisor.cancel(
            taskId,
            new Error("A2A stream consumer disconnected"),
          );
        }
      }

      function send(data: Record<string, unknown>): void {
        sendRaw(`data: ${JSON.stringify(data)}\n\n`);
      }

      function finish(): void {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      function statusEvent(
        task: Task,
        isFinal: boolean,
      ): Record<string, unknown> {
        return {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            kind: "status-update",
            taskId: task.id,
            contextId: task.contextId,
            status: task.status,
            final: isFinal,
          },
        };
      }

      // Send initial "working" event
      const workingTask = context.taskManager.getTask(taskId);
      if (workingTask) {
        send(statusEvent(workingTask.task, false));
      }

      context.turnSupervisor.start(
        taskId,
        async (signal) => {
          try {
            const agentResponse = await context.agentService.chat(
              messageText,
              record.conversationId,
              {
                userPermissionLevel: context.callerPermissionLevel,
                interfaceType: "a2a",
              },
              signal,
            );
            if (signal.aborted || isTaskCanceled(taskId, context.taskManager)) {
              return;
            }
            context.taskManager.updateState(
              taskId,
              "completed",
              agentResponse.text,
            );
            const completed = context.taskManager.getTask(taskId);
            if (completed) {
              send(statusEvent(completed.task, true));
            }
          } catch (error) {
            if (signal.aborted) return;
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            context.taskManager.updateState(
              taskId,
              "failed",
              `Error: ${errorMessage}`,
            );
            const failed = context.taskManager.getTask(taskId);
            if (failed) {
              send(statusEvent(failed.task, true));
            }
          } finally {
            finish();
          }
        },
        {
          onCancel: () => {
            context.taskManager.updateState(taskId, "canceled");
            const canceled = context.taskManager.getTask(taskId);
            if (canceled) {
              send(statusEvent(canceled.task, true));
            }
            finish();
          },
          ...(heartbeatIntervalMs > 0
            ? {
                heartbeat: {
                  intervalMs: heartbeatIntervalMs,
                  tick: (): void => sendRaw(": heartbeat\n\n"),
                },
              }
            : {}),
        },
      );
    },
    cancel(reason): void {
      closed = true;
      context.turnSupervisor.cancel(
        taskId,
        reason ?? new Error("A2A stream consumer disconnected"),
      );
    },
  });

  return { taskId, stream };
}

function taskSnapshotStream(
  requestId: string | number,
  task: Task,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            jsonrpc: "2.0",
            id: requestId,
            result: {
              kind: "status-update",
              taskId: task.id,
              contextId: task.contextId,
              status: task.status,
              final: TERMINAL_STATES.has(task.status.state),
            },
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });
}

function callerCanAccessTask(
  record: { callerDomain: string | null },
  context: JsonRpcHandlerContext,
): boolean {
  return (
    record.callerDomain !== null && record.callerDomain === context.callerDomain
  );
}

function handleGetTask(
  id: string | number,
  params: Record<string, unknown>,
  context: JsonRpcHandlerContext,
): JsonRpcResponse {
  const parsed = taskIdParamsSchema.safeParse(params);
  if (!parsed.success) {
    return errorResponse(id, -32602, `Invalid params: ${parsed.error.message}`);
  }

  const record = context.taskManager.getTask(parsed.data.id);
  if (!record || !callerCanAccessTask(record, context)) {
    return errorResponse(id, -32001, `Task not found: ${parsed.data.id}`);
  }

  const task = context.taskManager.getTaskWithHistory(
    parsed.data.id,
    parsed.data.historyLength,
  );

  if (!task) {
    return errorResponse(id, -32001, `Task not found: ${parsed.data.id}`);
  }

  return successResponse(id, task);
}

function handleCancelTask(
  id: string | number,
  params: Record<string, unknown>,
  context: JsonRpcHandlerContext,
): JsonRpcResponse {
  const parsed = taskIdParamsSchema.safeParse(params);
  if (!parsed.success) {
    return errorResponse(id, -32602, `Invalid params: ${parsed.error.message}`);
  }

  const record = context.taskManager.getTask(parsed.data.id);
  if (!record || !callerCanAccessTask(record, context)) {
    return errorResponse(id, -32001, `Task not found: ${parsed.data.id}`);
  }

  if (TERMINAL_STATES.has(record.task.status.state)) {
    return errorResponse(
      id,
      -32002,
      `Task is not cancelable (state: ${record.task.status.state})`,
    );
  }

  const canceled = context.turnSupervisor.cancel(
    parsed.data.id,
    new Error("A2A task canceled by caller"),
  );
  const updated = canceled
    ? context.taskManager.getTask(parsed.data.id)
    : context.taskManager.updateState(parsed.data.id, "canceled");
  if (!updated) {
    return errorResponse(id, -32603, "Internal error: task disappeared");
  }

  return successResponse(id, updated.task);
}
