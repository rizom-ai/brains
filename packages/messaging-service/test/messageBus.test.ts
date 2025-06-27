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
      const result = await messageBus.send("test.message", { value: "test" });

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

      const result = await messageBus.send("test.message", { value: "test" });

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

      const result = await messageBus.send("test.message", { value: "test" });

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

      const result = await messageBus.send("test.message", { value: "test" });

      expect(errorHandler1).toHaveBeenCalled();
      expect(errorHandler2).toHaveBeenCalled();
      expect(result.success).toBe(false);
    });
  });

  describe("message processing", () => {
    it("should process valid messages through message bus", async () => {
      const handler = mock(() => ({
        success: true,
        data: { result: "handled" },
      }));
      messageBus.subscribe("test.message", handler);

      const message = {
        id: "test-1",
        type: "test.message",
        timestamp: new Date().toISOString(),
        payload: { data: "test" },
      };

      const response = await messageBus.processMessage(message);

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ result: "handled" });
      expect(handler).toHaveBeenCalled();
    });

    it("should return error for invalid messages", async () => {
      const invalidMessage = {
        // Missing required 'id' and 'type' fields
        data: "invalid",
      };

      const response = await messageBus.processMessage(invalidMessage);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("INVALID_MESSAGE");
    });

    it("should return error when no handler found", async () => {
      const message = {
        id: "test-2",
        type: "unknown.message",
        timestamp: new Date().toISOString(),
      };

      const response = await messageBus.processMessage(message);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("NO_HANDLER");
    });

    it("should handle errors in message processing", async () => {
      // Subscribe a handler that throws an error
      messageBus.subscribe("error.message", () => {
        throw new Error("Handler error");
      });

      const message = {
        id: "test-3",
        type: "error.message",
        timestamp: new Date().toISOString(),
      };

      const response = await messageBus.processMessage(message);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("NO_HANDLER"); // Error in handler means no valid response
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
});