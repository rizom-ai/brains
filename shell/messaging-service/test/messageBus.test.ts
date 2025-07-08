import { describe, expect, it, beforeEach, mock } from "bun:test";
import { MessageBus } from "@/messageBus";

import { createSilentLogger, type Logger } from "@brains/utils";
import { z } from "zod";

describe("MessageBus", () => {
  let messageBus: MessageBus;
  let logger: Logger;

  beforeEach(() => {
    logger = createSilentLogger();
    messageBus = MessageBus.createFresh(logger);
  });

  describe("handler registration", () => {
    it("should subscribe a handler for a message type", () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler);

      expect(messageBus.hasHandlers("test.message")).toBe(true);
      expect(messageBus.getHandlerCount("test.message")).toBe(1);
    });

    it("should subscribe multiple handlers for the same message type", () => {
      const handler1 = mock(() => ({ success: true }));
      const handler2 = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler1);
      messageBus.subscribe("test.message", handler2);

      expect(messageBus.getHandlerCount("test.message")).toBe(2);
    });

    it("should unsubscribe a handler", () => {
      const handler = mock(() => ({ success: true }));

      const unsubscribe = messageBus.subscribe("test.message", handler);
      expect(messageBus.getHandlerCount("test.message")).toBe(1);

      unsubscribe();
      expect(messageBus.hasHandlers("test.message")).toBe(false);
    });

    it("should clear all handlers for a message type", () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler);
      messageBus.clearHandlers("test.message");

      expect(messageBus.hasHandlers("test.message")).toBe(false);
    });

    it("should clear all handlers", () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message1", handler);
      messageBus.subscribe("test.message2", handler);
      messageBus.clearAllHandlers();

      expect(messageBus.hasHandlers("test.message1")).toBe(false);
      expect(messageBus.hasHandlers("test.message2")).toBe(false);
    });
  });

  describe("message sending", () => {
    it("should send message to handler", async () => {
      const handler = mock(() => ({ success: true, data: { result: "test" } }));

      messageBus.subscribe("test.message", handler);
      const result = await messageBus.send(
        "test.message",
        { value: "test" },
        "test-source",
      );

      expect(handler).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: "test" });
    });

    it("should return error if no handlers registered", async () => {
      const result = await messageBus.send(
        "test.message",
        { value: "test" },
        "test-source",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No handler found");
    });

    it("should return first handler's response", async () => {
      const handler1 = mock(() => ({
        success: false,
        error: "handler1 error",
      }));
      const handler2 = mock(() => ({
        success: true,
        data: { result: "handler2" },
      }));

      messageBus.subscribe("test.message", handler1);
      messageBus.subscribe("test.message", handler2);

      const result = await messageBus.send(
        "test.message",
        { value: "test" },
        "test-source",
      );

      expect(handler1).toHaveBeenCalled();
      // In the current implementation, it returns the first handler's response
      // even if it's a failure
      expect(handler2).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe("handler1 error");
    });

    it("should handle errors in handlers gracefully", async () => {
      const errorHandler = mock(() => {
        throw new Error("Handler error");
      });
      const successHandler = mock(() => ({
        success: true,
        data: { result: "success" },
      }));

      messageBus.subscribe("test.message", errorHandler);
      messageBus.subscribe("test.message", successHandler);

      const result = await messageBus.send(
        "test.message",
        { value: "test" },
        "test-source",
      );

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: "success" });
    });

    it("should return error if all handlers throw errors", async () => {
      const errorHandler1 = mock(() => {
        throw new Error("Error 1");
      });
      const errorHandler2 = mock(() => {
        throw new Error("Error 2");
      });

      messageBus.subscribe("test.message", errorHandler1);
      messageBus.subscribe("test.message", errorHandler2);

      const result = await messageBus.send(
        "test.message",
        { value: "test" },
        "test-source",
      );

      expect(errorHandler1).toHaveBeenCalled();
      expect(errorHandler2).toHaveBeenCalled();
      expect(result.success).toBe(false);
    });
  });

  describe("message validation", () => {
    it("should validate messages against schemas", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const validMessage = { name: "John", age: 30 };
      const result = messageBus.validateMessage(validMessage, schema);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toEqual(validMessage);
      }
    });

    it("should return validation errors for invalid messages", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const invalidMessage = { name: "John", age: "thirty" };
      const result = messageBus.validateMessage(invalidMessage, schema);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("message filtering", () => {
    it("should filter messages by target", async () => {
      const handler1 = mock(() => ({ success: true, data: "handler1" }));
      const handler2 = mock(() => ({ success: true, data: "handler2" }));

      messageBus.subscribe("test.message", handler1, {
        target: "service1",
      });
      messageBus.subscribe("test.message", handler2, {
        target: "service2",
      });

      // Send to service1
      const result1 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
        "service1",
      );
      expect(result1.success).toBe(true);
      expect(result1.data).toBe("handler1");
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(0);

      // Send to service2
      const result2 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
        "service2",
      );
      expect(result2.success).toBe(true);
      expect(result2.data).toBe("handler2");
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Send without target (no handlers match)
      const result3 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
      );
      expect(result3.success).toBe(false);
      expect(result3.error).toContain("No handler found");
    });

    it("should filter messages by source", async () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler, {
        source: "trusted-source",
      });

      // Send from trusted source
      const result1 = await messageBus.send(
        "test.message",
        { content: "test" },
        "trusted-source",
      );
      expect(result1.success).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);

      // Send from untrusted source
      const result2 = await messageBus.send(
        "test.message",
        { content: "test" },
        "untrusted-source",
      );
      expect(result2.success).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should filter messages by metadata", async () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler, {
        metadata: { batchId: "batch-123", priority: 5 },
      });

      // Send with matching metadata
      const result1 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
        undefined,
        { batchId: "batch-123", priority: 5, extra: "ignored" },
      );
      expect(result1.success).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);

      // Send with partial metadata (missing priority)
      const result2 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
        undefined,
        { batchId: "batch-123" },
      );
      expect(result2.success).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);

      // Send with wrong metadata value
      const result3 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
        undefined,
        { batchId: "batch-456", priority: 5 },
      );
      expect(result3.success).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should support wildcard patterns in filters", async () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler, {
        target: "matrix:*",
      });

      // Should match matrix:room1
      const result1 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
        "matrix:room1",
      );
      expect(result1.success).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);

      // Should match matrix:room2
      const result2 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
        "matrix:room2",
      );
      expect(result2.success).toBe(true);
      expect(handler).toHaveBeenCalledTimes(2);

      // Should not match cli:session1
      const result3 = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
        "cli:session1",
      );
      expect(result3.success).toBe(false);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should support regex patterns in filters", async () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler, {
        source: /^plugin:\w+$/,
      });

      // Should match plugin:note
      const result1 = await messageBus.send(
        "test.message",
        { content: "test" },
        "plugin:note",
      );
      expect(result1.success).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);

      // Should not match plugin:note:extra
      const result2 = await messageBus.send(
        "test.message",
        { content: "test" },
        "plugin:note:extra",
      );
      expect(result2.success).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should support custom predicate filters", async () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler, {
        predicate: (message) => {
          const payload = message.payload as { priority?: number };
          return payload.priority ? payload.priority > 5 : false;
        },
      });

      // High priority message
      const result1 = await messageBus.send(
        "test.message",
        { content: "test", priority: 10 },
        "sender",
      );
      expect(result1.success).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);

      // Low priority message
      const result2 = await messageBus.send(
        "test.message",
        { content: "test", priority: 3 },
        "sender",
      );
      expect(result2.success).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should combine multiple filter criteria", async () => {
      const handler = mock(() => ({ success: true }));

      messageBus.subscribe("test.message", handler, {
        source: "plugin:*",
        target: "matrix",
        metadata: { enabled: true },
      });

      // All criteria match
      const result1 = await messageBus.send(
        "test.message",
        { content: "test" },
        "plugin:note",
        "matrix",
        { enabled: true },
      );
      expect(result1.success).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);

      // Wrong source
      const result2 = await messageBus.send(
        "test.message",
        { content: "test" },
        "shell",
        "matrix",
        { enabled: true },
      );
      expect(result2.success).toBe(false);

      // Wrong target
      const result3 = await messageBus.send(
        "test.message",
        { content: "test" },
        "plugin:note",
        "cli",
        { enabled: true },
      );
      expect(result3.success).toBe(false);

      // Wrong metadata
      const result4 = await messageBus.send(
        "test.message",
        { content: "test" },
        "plugin:note",
        "matrix",
        { enabled: false },
      );
      expect(result4.success).toBe(false);
    });

    it("should count targeted handlers", () => {
      messageBus.subscribe("test.message", mock(), { target: "service1" });
      messageBus.subscribe("test.message", mock(), { target: "service1" });
      messageBus.subscribe("test.message", mock(), { target: "service2" });
      messageBus.subscribe("test.message", mock()); // No filter

      expect(messageBus.getHandlerCount("test.message")).toBe(4);
      expect(
        messageBus.getTargetedHandlerCount("test.message", "service1"),
      ).toBe(2);
      expect(
        messageBus.getTargetedHandlerCount("test.message", "service2"),
      ).toBe(1);
      expect(
        messageBus.getTargetedHandlerCount("test.message", "service3"),
      ).toBe(0);
    });

    it("should handle no filter (broadcast messages)", async () => {
      const handler1 = mock(() => ({ success: true, data: "first" }));
      const handler2 = mock(() => ({ success: true, data: "second" }));
      const handler3 = mock(() => ({ success: true, data: "third" }));

      // All handlers match when no filter is applied
      messageBus.subscribe("test.message", handler1);
      messageBus.subscribe("test.message", handler2);
      messageBus.subscribe("test.message", handler3);

      const result = await messageBus.send(
        "test.message",
        { content: "broadcast" },
        "sender",
      );

      // Should get response from first handler
      expect(result.success).toBe(true);
      expect(result.data).toBe("first");

      // Only first handler is called (stops after getting response)
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(0);
      expect(handler3).toHaveBeenCalledTimes(0);
    });

    it("should call handlers in sequence when they throw", async () => {
      const handler1 = mock(() => {
        throw new Error("Handler 1 error");
      });
      const handler2 = mock(() => ({ success: true, data: "second" }));
      const handler3 = mock(() => ({ success: true, data: "third" }));

      messageBus.subscribe("test.message", handler1);
      messageBus.subscribe("test.message", handler2);
      messageBus.subscribe("test.message", handler3);

      const result = await messageBus.send(
        "test.message",
        { content: "test" },
        "sender",
      );

      // Should skip erroring handler and get response from second
      expect(result.success).toBe(true);
      expect(result.data).toBe("second");

      // First two handlers called
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(0);
    });
  });
});
