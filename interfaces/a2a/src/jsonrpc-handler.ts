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
      blocking: z.boolean().optional(),
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

  const blocking = parsed.data.configuration?.blocking ?? false;

  // Create task
  const record = context.taskManager.createTask(messageText, contextId);
  const taskId = record.task.id;

  // Move to working
  context.taskManager.updateState(taskId, "working");

  if (blocking) {
    // Synchronous path: await agent and return completed/failed task
    return processAndRespond(
      id,
      taskId,
      messageText,
      record.conversationId,
      parsed.data.configuration?.historyLength,
      context,
    );
  }

  // Non-blocking path: fire agent processing in background, return "working" immediately
  processInBackground(taskId, messageText, record.conversationId, context);

  const workingRecord = context.taskManager.getTask(taskId);
  if (!workingRecord) {
    return errorResponse(id, -32603, "Internal error: task disappeared");
  }

  return successResponse(id, workingRecord.task);
}

/**
 * Process agent chat synchronously and return a completed/failed response.
 * Used for blocking mode.
 */
async function processAndRespond(
  id: string | number,
  taskId: string,
  messageText: string,
  conversationId: string,
  historyLength: number | undefined,
  context: JsonRpcHandlerContext,
): Promise<JsonRpcResponse> {
  let updated: ReturnType<typeof context.taskManager.updateState>;
  try {
    const agentResponse = await context.agentService.chat(
      messageText,
      conversationId,
      {
        userPermissionLevel: context.callerPermissionLevel,
        interfaceType: "a2a",
      },
    );

    updated = context.taskManager.updateState(
      taskId,
      "completed",
      agentResponse.text,
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    updated = context.taskManager.updateState(
      taskId,
      "failed",
      `Error: ${errorMessage}`,
    );
  }

  if (!updated) {
    return errorResponse(id, -32603, "Internal error: task disappeared");
  }

  const task =
    historyLength !== undefined
      ? context.taskManager.getTaskWithHistory(taskId, historyLength)
      : updated.task;

  if (!task) {
    return errorResponse(id, -32603, "Internal error: task disappeared");
  }

  return successResponse(id, task);
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
