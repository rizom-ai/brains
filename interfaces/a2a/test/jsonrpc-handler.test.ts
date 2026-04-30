import { describe, it, expect, beforeEach } from "bun:test";
import { TaskManager } from "../src/task-manager";
import {
  handleJsonRpc,
  handleStreamMessage,
  type JsonRpcResponse,
} from "../src/jsonrpc-handler";
import type { AgentNamespace, AgentResponse } from "@brains/plugins";
import type { Task } from "@a2a-js/sdk";

const OK_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
const OK_RESPONSE: AgentResponse = { text: "ok", usage: OK_USAGE };

function createMockAgentService(
  response?: Partial<AgentResponse>,
): AgentNamespace {
  const r: AgentResponse = {
    text: response?.text ?? "Hello from the agent",
    usage: response?.usage ?? {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
    toolResults: response?.toolResults,
    pendingConfirmation: response?.pendingConfirmation,
  };
  return {
    chat: async () => r,
    confirmPendingAction: async () => r,
    invalidate: (): void => {},
  };
}

function createCustomAgentService(
  overrides: Partial<AgentNamespace>,
): AgentNamespace {
  const base = createMockAgentService();
  return { ...base, ...overrides };
}

/**
 * Assert response is a success and return the task result
 */
function expectSuccess(response: JsonRpcResponse): Task {
  expect(response.error).toBeUndefined();
  if (response.error) throw new Error("unreachable");
  return response.result;
}

/**
 * Assert response is an error and return the error object
 */
function expectError(response: JsonRpcResponse): {
  code: number;
  message: string;
} {
  expect(response.result).toBeUndefined();
  if (response.result) throw new Error("unreachable");
  return response.error;
}

/**
 * Extract text from the first text part of a task's status message
 */
function statusMessageText(task: Task): string {
  const msg = task.status.message;
  if (!msg) throw new Error("No status message");
  const parts = msg.parts;
  if (parts.length === 0) throw new Error("No parts in status message");
  const first = parts[0];
  if (!first) throw new Error("First part is undefined");
  if (first.kind !== "text") throw new Error("First part is not text");
  return first.text;
}

/**
 * Helper to build a valid JSON-RPC request
 */
function rpcRequest(
  method: string,
  params: Record<string, unknown>,
  id: string | number = 1,
): {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params: Record<string, unknown>;
} {
  return { jsonrpc: "2.0", id, method, params };
}

/** Standard user message params */
function userMessage(
  text: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    message: {
      kind: "message",
      messageId: "msg-1",
      role: "user",
      parts: [{ kind: "text", text }],
      ...extra,
    },
  };
}

describe("JSON-RPC Handler", () => {
  let taskManager: TaskManager;
  let agentService: AgentNamespace;

  beforeEach(() => {
    taskManager = new TaskManager();
    agentService = createMockAgentService();
  });

  describe("message/send", () => {
    it("should pass message to AgentService with correct conversation ID", async () => {
      let capturedMessage = "";
      let capturedConversationId = "";

      const trackingService = createCustomAgentService({
        chat: async (message, conversationId) => {
          capturedMessage = message;
          capturedConversationId = conversationId;
          return OK_RESPONSE;
        },
      });

      const request = rpcRequest("message/send", userMessage("Hello agent"));
      await handleJsonRpc(request, {
        taskManager,
        agentService: trackingService,
        callerPermissionLevel: "public",
      });

      expect(capturedMessage).toBe("Hello agent");
      expect(capturedConversationId).toStartWith("a2a:");
    });

    it("should pass caller permission level to AgentService", async () => {
      let capturedLevel = "";

      const trackingService = createCustomAgentService({
        chat: async (_message, _conversationId, context) => {
          capturedLevel = context?.userPermissionLevel ?? "public";
          return OK_RESPONSE;
        },
      });

      const request = rpcRequest("message/send", userMessage("Hello"));
      await handleJsonRpc(request, {
        taskManager,
        agentService: trackingService,
        callerPermissionLevel: "trusted",
      });

      expect(capturedLevel).toBe("trusted");
    });

    it("should use contextId from message when provided", async () => {
      const request = rpcRequest(
        "message/send",
        userMessage("Hello", {
          contextId: "existing-context-123",
        }),
      );

      const response = await handleJsonRpc(request, {
        taskManager,
        agentService,
        callerPermissionLevel: "public",
      });

      const task = expectSuccess(response);
      expect(task.contextId).toBe("existing-context-123");
    });

    it("should concatenate multiple text parts", async () => {
      let capturedMessage = "";

      const trackingService = createCustomAgentService({
        chat: async (message) => {
          capturedMessage = message;
          return OK_RESPONSE;
        },
      });

      const request = rpcRequest("message/send", {
        message: {
          kind: "message",
          messageId: "msg-1",
          role: "user",
          parts: [
            { kind: "text", text: "First part." },
            { kind: "text", text: "Second part." },
          ],
        },
      });

      await handleJsonRpc(request, {
        taskManager,
        agentService: trackingService,
        callerPermissionLevel: "public",
      });

      expect(capturedMessage).toBe("First part.\nSecond part.");
    });

    it("should store the task for later retrieval", async () => {
      const request = rpcRequest("message/send", userMessage("Hello"));

      const response = await handleJsonRpc(request, {
        taskManager,
        agentService,
        callerPermissionLevel: "public",
      });

      const task = expectSuccess(response);
      expect(taskManager.getTask(task.id)).toBeDefined();
    });

    it("should return failed task when AgentService throws", async () => {
      const failingService = createCustomAgentService({
        chat: async () => {
          throw new Error("LLM provider unavailable");
        },
        confirmPendingAction: async () => {
          throw new Error("not implemented");
        },
      });

      const request = rpcRequest("message/send", userMessage("Hello"));

      const response = await handleJsonRpc(request, {
        taskManager,
        agentService: failingService,
        callerPermissionLevel: "public",
      });

      const task = expectSuccess(response);

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 10));

      const failed = taskManager.getTask(task.id);
      expect(failed?.task.status.state).toBe("failed");
    });

    it("should return error for missing message in params", async () => {
      const request = rpcRequest("message/send", {});

      const response = await handleJsonRpc(request, {
        taskManager,
        agentService,
        callerPermissionLevel: "public",
      });

      const error = expectError(response);
      expect(error.code).toBe(-32602);
    });

    it("should return error for message with no text parts", async () => {
      const request = rpcRequest("message/send", {
        message: {
          kind: "message",
          messageId: "msg-1",
          role: "user",
          parts: [{ kind: "data", data: { foo: "bar" } }],
        },
      });

      const response = await handleJsonRpc(request, {
        taskManager,
        agentService,
        callerPermissionLevel: "public",
      });

      const error = expectError(response);
      expect(error.code).toBe(-32602);
    });
  });

  describe("tasks/get", () => {
    it("should return an existing task", async () => {
      // First create a task
      const sendResponse = await handleJsonRpc(
        rpcRequest("message/send", userMessage("Hello")),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );
      const taskId = expectSuccess(sendResponse).id;

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 10));

      // Then get it
      const getResponse = await handleJsonRpc(
        rpcRequest("tasks/get", { id: taskId }),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );

      const task = expectSuccess(getResponse);
      expect(task.id).toBe(taskId);
      expect(task.status.state).toBe("completed");
    });

    it("should respect historyLength parameter", async () => {
      const sendResponse = await handleJsonRpc(
        rpcRequest("message/send", userMessage("Hello")),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );
      await new Promise((r) => setTimeout(r, 10));
      const taskId = expectSuccess(sendResponse).id;

      const getResponse = await handleJsonRpc(
        rpcRequest("tasks/get", { id: taskId, historyLength: 1 }),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );

      const task = expectSuccess(getResponse);
      expect(task.history).toHaveLength(1);
    });

    it("should return error for unknown task ID", async () => {
      const response = await handleJsonRpc(
        rpcRequest("tasks/get", { id: "nonexistent" }),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );

      const error = expectError(response);
      expect(error.code).toBe(-32001);
    });

    it("should return error when id is missing", async () => {
      const response = await handleJsonRpc(rpcRequest("tasks/get", {}), {
        taskManager,
        agentService,
        callerPermissionLevel: "public",
      });

      const error = expectError(response);
      expect(error.code).toBe(-32602);
    });
  });

  describe("tasks/cancel", () => {
    it("should return error for unknown task ID", async () => {
      const response = await handleJsonRpc(
        rpcRequest("tasks/cancel", { id: "nonexistent" }),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );

      const error = expectError(response);
      expect(error.code).toBe(-32001);
    });

    it("should return error for already completed task", async () => {
      const sendResponse = await handleJsonRpc(
        rpcRequest("message/send", userMessage("Hello")),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );
      const taskId = expectSuccess(sendResponse).id;

      // Wait for background processing to complete
      await new Promise((r) => setTimeout(r, 10));

      const cancelResponse = await handleJsonRpc(
        rpcRequest("tasks/cancel", { id: taskId }),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );

      const error = expectError(cancelResponse);
      expect(error.code).toBe(-32002);
    });
  });

  describe("protocol errors", () => {
    it("should return method not found for unknown methods", async () => {
      const response = await handleJsonRpc(rpcRequest("unknown/method", {}), {
        taskManager,
        agentService,
        callerPermissionLevel: "public",
      });

      const error = expectError(response);
      expect(error.code).toBe(-32601);
      expect(error.message).toContain("unknown/method");
    });

    it("should preserve request id in error responses", async () => {
      const response = await handleJsonRpc(
        rpcRequest("unknown/method", {}, 42),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );

      expect(response.id).toBe(42);
    });

    it("should preserve request id in success responses", async () => {
      const response = await handleJsonRpc(
        rpcRequest("message/send", userMessage("Hello"), "req-abc"),
        { taskManager, agentService, callerPermissionLevel: "public" },
      );

      expect(response.id).toBe("req-abc");
    });
  });

  describe("message/send (non-blocking)", () => {
    it("should return working task immediately without awaiting agent", async () => {
      // Agent that takes a long time — non-blocking should NOT wait for it
      let agentCalled = false;
      const slowAgent = createCustomAgentService({
        chat: async () => {
          agentCalled = true;
          await new Promise((r) => setTimeout(r, 5000));
          return { text: "done", usage: OK_USAGE };
        },
      });

      const request = rpcRequest("message/send", userMessage("Hello"));
      const response = await handleJsonRpc(request, {
        taskManager,
        agentService: slowAgent,
        callerPermissionLevel: "public",
      });

      const task = expectSuccess(response);
      expect(task.status.state).toBe("working");
      // Agent was called (fire-and-forget), but we didn't wait for it
      expect(agentCalled).toBe(true);
    });

    it("should complete task in background after returning working", async () => {
      const agentDone = createMockAgentService({
        text: "Background result",
      });

      // Agent responds after a short delay
      const delayedAgent: AgentNamespace = {
        chat: async (...args) => {
          await new Promise((r) => setTimeout(r, 50));
          return agentDone.chat(...args);
        },
        confirmPendingAction: agentDone.confirmPendingAction,
        invalidate: (): void => {},
      };

      const request = rpcRequest("message/send", userMessage("Hello"));
      const response = await handleJsonRpc(request, {
        taskManager,
        agentService: delayedAgent,
        callerPermissionLevel: "public",
      });

      const task = expectSuccess(response);
      expect(task.status.state).toBe("working");

      // Wait for background processing to complete
      await new Promise((r) => setTimeout(r, 100));

      // Task should now be completed
      const completed = taskManager.getTask(task.id);
      expect(completed?.task.status.state).toBe("completed");
      expect(statusMessageText(completed?.task as Task)).toBe(
        "Background result",
      );
    });

    it("should transition task to failed when agent throws in background", async () => {
      const failingAgent = createCustomAgentService({
        chat: async () => {
          throw new Error("Agent crashed");
        },
      });

      const request = rpcRequest("message/send", userMessage("Hello"));
      const response = await handleJsonRpc(request, {
        taskManager,
        agentService: failingAgent,
        callerPermissionLevel: "public",
      });

      const task = expectSuccess(response);

      // Background processing may complete before or after return,
      // so wait a tick then verify the task reached "failed"
      await new Promise((r) => setTimeout(r, 10));

      const failed = taskManager.getTask(task.id);
      expect(failed?.task.status.state).toBe("failed");
    });
  });

  describe("message/stream (SSE)", () => {
    /** Collect all SSE events from a ReadableStream */
    async function collectEvents(
      stream: ReadableStream<Uint8Array>,
    ): Promise<Record<string, unknown>[]> {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const events: Record<string, unknown>[] = [];

      let chunk = await reader.read();
      while (!chunk.done) {
        buffer += decoder.decode(chunk.value, { stream: true });

        // Parse SSE events (data: {...}\n\n)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (dataLine) {
            events.push(JSON.parse(dataLine.slice(6)));
          }
        }
        chunk = await reader.read();
      }
      return events;
    }

    it("should stream status-update events with correct shape", async () => {
      agentService = createMockAgentService({ text: "Streamed result" });

      const result = handleStreamMessage(
        1,
        { kind: "message", parts: [{ kind: "text", text: "Hello" }] },
        {
          taskManager,
          agentService,
          callerPermissionLevel: "public",
        },
      );

      const events = await collectEvents(result.stream);

      // All events should be JSON-RPC envelopes with status-update result
      for (const event of events) {
        expect(event).toHaveProperty("jsonrpc", "2.0");
        expect(event).toHaveProperty("id", 1);
        expect(event).toHaveProperty("result.kind", "status-update");
        expect(event).toHaveProperty("result.taskId");
        expect(event).toHaveProperty("result.status");
        expect(event).toHaveProperty("result.final");
      }

      // First event: working, not final
      expect(events[0]).toHaveProperty("result.status.state", "working");
      expect(events[0]).toHaveProperty("result.final", false);

      // Last event: completed, final
      const last = events[events.length - 1];
      expect(last).toHaveProperty("result.status.state", "completed");
      expect(last).toHaveProperty("result.final", true);
    });

    it("should stream failed status-update when agent throws", async () => {
      const failingAgent = createCustomAgentService({
        chat: async () => {
          throw new Error("Boom");
        },
      });

      const result = handleStreamMessage(
        1,
        { kind: "message", parts: [{ kind: "text", text: "Hello" }] },
        {
          taskManager,
          agentService: failingAgent,
          callerPermissionLevel: "public",
        },
      );

      const events = await collectEvents(result.stream);

      const last = events[events.length - 1];
      expect(last).toHaveProperty("result.kind", "status-update");
      expect(last).toHaveProperty("result.status.state", "failed");
      expect(last).toHaveProperty("result.final", true);
    });

    it("should return taskId with the stream", () => {
      const result = handleStreamMessage(
        1,
        { kind: "message", parts: [{ kind: "text", text: "Hello" }] },
        {
          taskManager,
          agentService,
          callerPermissionLevel: "public",
        },
      );

      expect(result.taskId).toBeDefined();
      expect(typeof result.taskId).toBe("string");
    });

    it("should not throw when consumer disconnects early", async () => {
      // Slow agent — consumer will cancel before it completes
      const slowAgent = createCustomAgentService({
        chat: async () => {
          await new Promise((r) => setTimeout(r, 5000));
          return { text: "late", usage: OK_USAGE };
        },
      });

      const result = handleStreamMessage(
        1,
        { kind: "message", parts: [{ kind: "text", text: "Hello" }] },
        {
          taskManager,
          agentService: slowAgent,
          callerPermissionLevel: "public",
        },
      );

      // Read one event then cancel
      const reader = result.stream.getReader();
      await reader.read(); // get working event
      await reader.cancel(); // disconnect

      // Should not throw — give background a tick
      await new Promise((r) => setTimeout(r, 50));
    });
  });
});
