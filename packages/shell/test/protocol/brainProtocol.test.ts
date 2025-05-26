import { describe, expect, it, beforeEach, mock } from "bun:test";
import { BrainProtocol } from "@/protocol/brainProtocol";
import { createSilentLogger, type Logger } from "@personal-brain/utils";
import { MessageBus } from "@/messaging/messageBus";
import { MessageFactory } from "@/messaging/messageFactory";
import { z } from "zod";

describe("BrainProtocol", () => {
  let brainProtocol: BrainProtocol;
  let logger: Logger;
  let messageBus: MessageBus;

  beforeEach(() => {
    logger = createSilentLogger();
    messageBus = MessageBus.createFresh(logger);
    brainProtocol = BrainProtocol.createFresh(logger, messageBus);
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

      const response = await brainProtocol.processMessage(message);

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ result: "handled" });
      expect(handler).toHaveBeenCalledWith(message);
    });

    it("should return error for invalid messages", async () => {
      const invalidMessage = {
        // Missing required 'id' and 'type' fields
        data: "invalid",
      };

      const response = await brainProtocol.processMessage(invalidMessage);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("INVALID_MESSAGE");
    });

    it("should return error when no handler found", async () => {
      const message = {
        id: "test-2",
        type: "unknown.message",
        timestamp: new Date().toISOString(),
      };

      const response = await brainProtocol.processMessage(message);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("NO_HANDLER");
    });
  });

  describe("message validation", () => {
    it("should validate messages against schemas", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const validMessage = { name: "John", age: 30 };
      const result = brainProtocol.validateMessage(validMessage, schema);

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
      const result = brainProtocol.validateMessage(invalidMessage, schema);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("error handling", () => {
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

      const response = await brainProtocol.processMessage(message);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("NO_HANDLER"); // Error in handler means no valid response
    });
  });
});
