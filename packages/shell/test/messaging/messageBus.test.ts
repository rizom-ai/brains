import { describe, expect, it, beforeEach, mock } from "bun:test";
import { MessageBus } from "@/messaging/messageBus";

import { createSilentLogger, type Logger } from "@brains/utils";
import type { BaseMessage, MessageResponse } from "@/messaging/types";
import { MessageFactory } from "@/messaging/messageFactory";
import { z } from "zod";

// Create test message
const createTestMessage = (type: string, id?: string): BaseMessage => ({
  id: id ?? "test-id",
  timestamp: new Date().toISOString(),
  type,
  source: "test",
});

// Create test response
const createTestResponse = (
  requestId: string,
  success: boolean = true,
): MessageResponse => ({
  id: "response-id",
  requestId,
  success,
  timestamp: new Date().toISOString(),
  data: { result: "test" },
});

describe("MessageBus", () => {
  let messageBus: MessageBus;
  let logger: Logger;

  beforeEach(() => {
    logger = createSilentLogger();
    messageBus = MessageBus.createFresh(logger);
  });

  describe("handler registration", () => {
    it("should register a handler for a message type", () => {
      const handler = mock(() => Promise.resolve(null));

      messageBus.registerHandler("test.message", handler);

      expect(messageBus.hasHandlers("test.message")).toBe(true);
      expect(messageBus.getHandlerCount("test.message")).toBe(1);
    });

    it("should register multiple handlers for the same message type", () => {
      const handler1 = mock(() => Promise.resolve(null));
      const handler2 = mock(() => Promise.resolve(null));

      messageBus.registerHandler("test.message", handler1);
      messageBus.registerHandler("test.message", handler2);

      expect(messageBus.getHandlerCount("test.message")).toBe(2);
    });

    it("should unregister a specific handler", () => {
      const handler1 = mock(() => Promise.resolve(null));
      const handler2 = mock(() => Promise.resolve(null));

      messageBus.registerHandler("test.message", handler1);
      messageBus.registerHandler("test.message", handler2);
      messageBus.unregisterHandler("test.message", handler1);

      expect(messageBus.getHandlerCount("test.message")).toBe(1);
    });

    it("should clear all handlers for a message type", () => {
      const handler = mock(() => Promise.resolve(null));

      messageBus.registerHandler("test.message", handler);
      messageBus.clearHandlers("test.message");

      expect(messageBus.hasHandlers("test.message")).toBe(false);
    });

    it("should clear all handlers", () => {
      const handler = mock(() => Promise.resolve(null));

      messageBus.registerHandler("test.message1", handler);
      messageBus.registerHandler("test.message2", handler);
      messageBus.clearAllHandlers();

      expect(messageBus.hasHandlers("test.message1")).toBe(false);
      expect(messageBus.hasHandlers("test.message2")).toBe(false);
    });
  });

  describe("message publishing", () => {
    it("should publish message to handler", async () => {
      const message = createTestMessage("test.message");
      const response = createTestResponse(message.id);
      const handler = mock(() => Promise.resolve(response));

      messageBus.registerHandler("test.message", handler);
      const result = await messageBus.publish(message);

      expect(handler).toHaveBeenCalledWith(message);
      expect(result).toEqual(response);
    });

    it("should return null if no handlers registered", async () => {
      const message = createTestMessage("test.message");
      const result = await messageBus.publish(message);

      expect(result).toBeNull();
    });

    it("should call handlers in sequence until one returns a response", async () => {
      const message = createTestMessage("test.message");
      const response = createTestResponse(message.id);

      const handler1 = mock(() => Promise.resolve(null));
      const handler2 = mock(() => Promise.resolve(response));
      const handler3 = mock(() => Promise.resolve(createTestResponse("other")));

      messageBus.registerHandler("test.message", handler1);
      messageBus.registerHandler("test.message", handler2);
      messageBus.registerHandler("test.message", handler3);

      const result = await messageBus.publish(message);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled(); // Should stop after handler2
      expect(result).toEqual(response);
    });

    it("should handle errors in handlers gracefully", async () => {
      const message = createTestMessage("test.message");
      const response = createTestResponse(message.id);

      const errorHandler = mock(() =>
        Promise.reject(new Error("Handler error")),
      );
      const successHandler = mock(() => Promise.resolve(response));

      messageBus.registerHandler("test.message", errorHandler);
      messageBus.registerHandler("test.message", successHandler);

      const result = await messageBus.publish(message);

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(result).toEqual(response);
    });

    it("should return null if all handlers throw errors", async () => {
      const message = createTestMessage("test.message");

      const errorHandler1 = mock(() => Promise.reject(new Error("Error 1")));
      const errorHandler2 = mock(() => Promise.reject(new Error("Error 2")));

      messageBus.registerHandler("test.message", errorHandler1);
      messageBus.registerHandler("test.message", errorHandler2);

      const result = await messageBus.publish(message);

      expect(result).toBeNull();
    });
  });

  describe("message processing", () => {
    it("should process valid messages through message bus", async () => {
      // Register a handler with the message bus
      const handler = mock(() =>
        Promise.resolve(
          MessageFactory.createSuccessResponse("test-1", { result: "handled" }),
        ),
      );
      messageBus.registerHandler("test.message", handler);

      const message = {
        id: "test-1",
        type: "test.message",
        timestamp: new Date().toISOString(),
        payload: { data: "test" },
      };

      const response = await messageBus.processMessage(message);

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ result: "handled" });
      expect(handler).toHaveBeenCalledWith(message);
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
      // Register a handler that throws an error
      messageBus.registerHandler("error.message", () => {
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

      const invalidMessage = { name: "John", age: "thirty" }; // age should be number
      const result = messageBus.validateMessage(invalidMessage, schema);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
