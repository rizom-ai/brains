import { z } from "@brains/utils";
import type { IAgentService } from "@brains/plugins";
import type { UserPermissionLevel } from "@brains/templates";
import type { Task } from "@a2a-js/sdk";
import { TERMINAL_STATES, type TaskManager } from "./task-manager";

// -- Zod schemas for request validation --

const messagePartsSchema = z.array(
  z.object({
    kind: z.string(),
    text: z.string().optional(),
    data: z.record(z.unknown()).optional(),
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

interface JsonRpcError {
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

export const jsonrpcRequestSchema = z.object({
  jsonrpc: z.string(),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export type JsonRpcRequest = z.infer<typeof jsonrpcRequestSchema>;

// -- Handler context --

export interface JsonRpcHandlerContext {
  taskManager: TaskManager;
  agentService: IAgentService;
  callerPermissionLevel: UserPermissionLevel;
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

  // Create task and move to working
  const record = context.taskManager.createTask(messageText, contextId);
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

/**
 * Process agent chat in the background (fire-and-forget).
 * Transitions task to completed or failed when done.
 * Own try/catch to prevent unhandled rejections.
 */
function processInBackground(
  taskId: string,
  messageText: string,
  conversationId: string,
  context: JsonRpcHandlerContext,
): void {
  context.agentService
    .chat(messageText, conversationId, {
      userPermissionLevel: context.callerPermissionLevel,
      interfaceType: "a2a",
    })
    .then((agentResponse) => {
      context.taskManager.updateState(taskId, "completed", agentResponse.text);
    })
    .catch((err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      context.taskManager.updateState(
        taskId,
        "failed",
        `Error: ${errorMessage}`,
      );
    });
}

// -- Streaming (SSE) handler --

export const streamParamsSchema = z.object({
  message: z.object({
    kind: z.string(),
    parts: messagePartsSchema,
    contextId: z.string().optional(),
  }),
});

interface StreamResult {
  taskId: string;
  stream: ReadableStream<Uint8Array>;
}

/**
 * Handle message/stream — returns an SSE stream of task status updates.
 * Creates a task, starts processing, and streams events until terminal state.
 * Each SSE event is wrapped in a JSON-RPC 2.0 response envelope.
 */
export function handleStreamMessage(
  requestId: string | number,
  message: z.infer<typeof streamParamsSchema>["message"],
  context: JsonRpcHandlerContext,
): StreamResult {
  const textParts = message.parts.filter(
    (p): p is { kind: "text"; text: string } =>
      p.kind === "text" && typeof p.text === "string",
  );

  const messageText =
    textParts.map((p) => p.text).join("\n") || "No message text";

  const record = context.taskManager.createTask(messageText, message.contextId);
  const taskId = record.task.id;

  context.taskManager.updateState(taskId, "working");

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller): void {
      let closed = false;

      function send(data: Record<string, unknown>): void {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
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

      // Process in background, send completion event, then close
      context.agentService
        .chat(messageText, record.conversationId, {
          userPermissionLevel: context.callerPermissionLevel,
          interfaceType: "a2a",
        })
        .then((agentResponse) => {
          context.taskManager.updateState(
            taskId,
            "completed",
            agentResponse.text,
          );
          const completed = context.taskManager.getTask(taskId);
          if (completed) {
            send(statusEvent(completed.task, true));
          }
          finish();
        })
        .catch((err: unknown) => {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          context.taskManager.updateState(
            taskId,
            "failed",
            `Error: ${errorMessage}`,
          );
          const failed = context.taskManager.getTask(taskId);
          if (failed) {
            send(statusEvent(failed.task, true));
          }
          finish();
        });
    },
  });

  return { taskId, stream };
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
  if (!record) {
    return errorResponse(id, -32001, `Task not found: ${parsed.data.id}`);
  }

  if (TERMINAL_STATES.has(record.task.status.state)) {
    return errorResponse(
      id,
      -32002,
      `Task is not cancelable (state: ${record.task.status.state})`,
    );
  }

  const updated = context.taskManager.updateState(parsed.data.id, "canceled");
  if (!updated) {
    return errorResponse(id, -32603, "Internal error: task disappeared");
  }

  return successResponse(id, updated.task);
}
