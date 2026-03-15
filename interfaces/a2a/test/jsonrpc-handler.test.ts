import { describe, it, expect, beforeEach } from "bun:test";
import { TaskManager } from "../src/task-manager";
import { handleJsonRpc, type JsonRpcResponse } from "../src/jsonrpc-handler";
import type { IAgentService, AgentResponse } from "@brains/plugins";
import type { Task } from "@a2a-js/sdk";

/**
 * Create a mock AgentService that returns a fixed response
 */
function createMockAgentService(
  response?: Partial<AgentResponse>,
): IAgentService {
  const defaultResponse: AgentResponse = {
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
    chat: async () => defaultResponse,
    confirmPendingAction: async () => defaultResponse,
  };
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
  let agentService: IAgentService;

  beforeEach(() => {
    taskManager = new TaskManager();
    agentService = createMockAgentService();
  });

  describe("message/send", () => {
    it("should create a task and return completed result", async () => {
      const request = rpcRequest(
        "message/send",
        userMessage("Write a blog post about AI"),
      );

      const response = await handleJsonRpc(request, {
        taskManager,
        agentService,
        callerPermissionLevel: "public",
      });

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
      const task = expectSuccess(response);
      expect(task.kind).toBe("task");
      expect(task.status.state).toBe("completed");
      expect(task.id).toBeDefined();
      expect(task.contextId).toBeDefined();
    });

    it("should include agent response text in status message", async () => {
      agentService = createMockAgentService({ text: "Here is your blog post" });
      const request = rpcRequest(
        "message/send",
        userMessage("Write something"),
      );

      const response = await handleJsonRpc(request, {
        taskManager,
        agentService,
        callerPermissionLevel: "public",
      });

      const task = expectSuccess(response);
      expect(statusMessageText(task)).toBe("Here is your blog post");
      expect(task.status.message?.role).toBe("agent");
    });

    it("should pass message to AgentService with correct conversation ID", async () => {
      let capturedMessage = "";
      let capturedConversationId = "";

      const trackingService: IAgentService = {
        chat: async (message, conversationId) => {
          capturedMessage = message;
          capturedConversationId = conversationId;
          return {
            text: "ok",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
        },
        confirmPendingAction: async () => ({
          text: "ok",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }),
      };

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

      const trackingService: IAgentService = {
        chat: async (_message, _conversationId, context) => {
          capturedLevel = context?.userPermissionLevel ?? "public";
          return {
            text: "ok",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
        },
        confirmPendingAction: async () => ({
          text: "ok",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }),
      };

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

      const trackingService: IAgentService = {
        chat: async (message) => {
          capturedMessage = message;
          return {
            text: "ok",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
        },
        confirmPendingAction: async () => ({
          text: "ok",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }),
      };

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
      const failingService: IAgentService = {
        chat: async () => {
          throw new Error("LLM provider unavailable");
        },
        confirmPendingAction: async () => {
          throw new Error("not implemented");
        },
      };

      const request = rpcRequest("message/send", userMessage("Hello"));

      const response = await handleJsonRpc(request, {
        taskManager,
        agentService: failingService,
        callerPermissionLevel: "public",
      });

      const task = expectSuccess(response);
      expect(task.status.state).toBe("failed");
      expect(statusMessageText(task)).toContain("LLM provider unavailable");
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
});
