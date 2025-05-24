import { describe, expect, it, beforeEach, mock } from "bun:test";
import { BrainProtocol } from "@/protocol/brainProtocol";

import { createSilentLogger, type Logger } from "@personal-brain/utils";
import { MessageBus } from "@/messaging/messageBus";
import type { QueryProcessor } from "@/query/queryProcessor";
import type { Command } from "@/protocol/brainProtocol";
import { MessageFactory } from "@/messaging/messageFactory";

// Create mock QueryProcessor
const createMockQueryProcessor = (): {
  processQuery: ReturnType<typeof mock>;
} => ({
  processQuery: mock(() =>
    Promise.resolve({
      answer: "Test answer",
      citations: [],
      relatedEntities: [],
    }),
  ),
});

describe("BrainProtocol", () => {
  let brainProtocol: BrainProtocol;
  let logger: Logger;
  let messageBus: MessageBus;
  let mockQueryProcessor: ReturnType<typeof createMockQueryProcessor>;

  beforeEach(() => {
    logger = createSilentLogger();
    messageBus = MessageBus.createFresh(logger);
    mockQueryProcessor = createMockQueryProcessor();
    brainProtocol = BrainProtocol.createFresh(
      logger,
      messageBus,
      mockQueryProcessor as unknown as QueryProcessor,
    );
  });

  describe("command execution", () => {
    it("should execute query command", async () => {
      const command: Command = {
        id: "cmd-1",
        command: "query",
        args: { query: "test query" },
        context: { userId: "user-1" },
      };

      const response = await brainProtocol.executeCommand(command);

      expect(response.success).toBe(true);
      expect(response.commandId).toBe(command.id);
      expect(response.result).toBeDefined();
      expect(mockQueryProcessor.processQuery).toHaveBeenCalledWith(
        "test query",
        expect.objectContaining({
          userId: "user-1",
          schema: expect.any(Object),
        }),
      );
    });

    it("should handle query command errors", async () => {
      mockQueryProcessor.processQuery = mock(() =>
        Promise.reject(new Error("Query failed")),
      );

      const command: Command = {
        id: "cmd-1",
        command: "query",
        args: { query: "test query" },
      };

      const response = await brainProtocol.executeCommand(command);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe("QUERY_ERROR");
      expect(response.error?.message).toBe("Query failed");
    });

    it("should execute help command", async () => {
      const command: Command = {
        id: "cmd-1",
        command: "help",
      };

      const response = await brainProtocol.executeCommand(command);

      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
      const result = response.result;
      expect(
        (result as { availableCommands: string[] }).availableCommands,
      ).toContain("query");
      expect(
        (result as { availableCommands: string[] }).availableCommands,
      ).toContain("help");
    });

    it("should handle unknown commands", async () => {
      const command: Command = {
        id: "cmd-1",
        command: "unknown",
        args: { foo: "bar" },
      };

      const response = await brainProtocol.executeCommand(command);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("COMMAND_NOT_FOUND");
      expect(response.error?.message).toContain("unknown");
    });
  });

  describe("custom command handlers", () => {
    it("should register and execute custom command", async () => {
      const customHandler = mock(async (cmd: Command) => ({
        id: "response-1",
        commandId: cmd.id,
        success: true,
        result: { custom: "result" },
      }));

      brainProtocol.registerCommandHandler("custom", customHandler);

      const command: Command = {
        id: "cmd-1",
        command: "custom",
        args: { test: "data" },
      };

      const response = await brainProtocol.executeCommand(command);

      expect(customHandler).toHaveBeenCalledWith(command);
      expect(response.success).toBe(true);
      expect(response.result).toEqual({ custom: "result" });
    });

    it("should overwrite existing handlers", () => {
      const handler1 = mock(async () => ({
        id: "r1",
        commandId: "c1",
        success: true,
      }));

      const handler2 = mock(async () => ({
        id: "r2",
        commandId: "c1",
        success: true,
      }));

      brainProtocol.registerCommandHandler("test", handler1);
      brainProtocol.registerCommandHandler("test", handler2);

      expect(brainProtocol.getRegisteredCommands()).toContain("test");
    });
  });

  describe("message processing", () => {
    it("should process valid command messages", async () => {
      const command = {
        id: "cmd-1",
        command: "help",
      };

      const response = await brainProtocol.processMessage(command);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it("should route non-command messages to message bus", async () => {
      const message = MessageFactory.createMessageWithPayload("test.message", {
        data: "test",
      });

      const busHandler = mock(() =>
        Promise.resolve(MessageFactory.createSuccessResponse(message.id)),
      );

      messageBus.registerHandler("test.message", busHandler);

      const response = await brainProtocol.processMessage(message);

      expect(response.success).toBe(true);
      expect(busHandler).toHaveBeenCalled();
    });

    it("should handle invalid messages", async () => {
      const invalidMessage = { invalid: "data" };

      const response = await brainProtocol.processMessage(invalidMessage);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("INVALID_MESSAGE");
    });
  });

  describe("message bus integration", () => {
    it("should handle command execution through message bus", async () => {
      const command = {
        id: "cmd-1",
        command: "query",
        args: { query: "test" },
      };

      const message = MessageFactory.createMessageWithPayload(
        "command.execute",
        command,
      );

      const response = await messageBus.publish(message);

      expect(response).toBeDefined();
      expect(response?.success).toBe(true);
    });
  });
});
