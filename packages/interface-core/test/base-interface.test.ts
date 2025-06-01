import { describe, it, expect, beforeEach } from "bun:test";
import { BaseInterface } from "../src/base-interface";
import type { MessageContext } from "../src/types";
import type { InterfaceContext } from "../src/base-interface";
import { createSilentLogger } from "@brains/utils";

// Simple mock function helper
function createMockFn() {
  const calls: any[] = [];
  let returnValue: any;
  let shouldReject = false;
  let rejectValue: any;

  const fn = ((...args: any[]) => {
    calls.push(args);
    if (shouldReject) {
      return Promise.reject(rejectValue);
    }
    return returnValue;
  }) as any;

  fn.calls = calls;
  fn.mockResolvedValue = (value: any) => {
    returnValue = Promise.resolve(value);
    shouldReject = false;
  };
  fn.mockRejectedValue = (value: any) => {
    rejectValue = value;
    shouldReject = true;
  };

  return fn;
}

// Create a concrete implementation for testing
class TestInterface extends BaseInterface {
  public mockHandleLocalCommand = createMockFn();
  public startCalled = false;
  public stopCalled = false;

  protected async handleLocalCommand(
    command: string,
    context: MessageContext,
  ): Promise<string | null> {
    return this.mockHandleLocalCommand(command, context);
  }

  public async start(): Promise<void> {
    this.startCalled = true;
  }

  public async stop(): Promise<void> {
    this.stopCalled = true;
  }

  // Expose protected methods for testing
  public testHandleInput(input: string, context: MessageContext): Promise<string> {
    return this.handleInput(input, context);
  }

  public testProcessMessage(content: string, context: MessageContext): Promise<string> {
    return this.processMessage(content, context);
  }
}

describe("BaseInterface", () => {
  let testInterface: TestInterface;
  let mockContext: InterfaceContext;
  let processQueryMock: any;
  let messageContext: MessageContext;

  beforeEach(() => {
    processQueryMock = createMockFn();
    processQueryMock.mockResolvedValue("Processed query result");
    
    mockContext = {
      name: "Test Interface",
      version: "1.0.0",
      logger: createSilentLogger(),
      processQuery: processQueryMock,
    };

    messageContext = {
      userId: "test-user",
      channelId: "test-channel",
      messageId: "test-msg",
      timestamp: new Date(),
    };

    testInterface = new TestInterface(mockContext);
  });

  describe("constructor", () => {
    it("should initialize with context properties", () => {
      expect(testInterface.name).toBe("Test Interface");
      expect(testInterface.version).toBe("1.0.0");
    });
  });

  describe("handleInput", () => {
    it("should process non-command input as query", async () => {
      const result = await testInterface.testHandleInput("Hello world", messageContext);
      
      expect(testInterface.mockHandleLocalCommand.calls).toHaveLength(0);
      expect(processQueryMock.calls).toHaveLength(1);
      expect(processQueryMock.calls[0]).toEqual(["Hello world", messageContext]);
      expect(result).toBe("Processed query result");
    });

    it("should check local commands for slash commands", async () => {
      testInterface.mockHandleLocalCommand.mockResolvedValue("Local command result");
      
      const result = await testInterface.testHandleInput("/help", messageContext);
      
      expect(testInterface.mockHandleLocalCommand.calls).toHaveLength(1);
      expect(testInterface.mockHandleLocalCommand.calls[0]).toEqual(["/help", messageContext]);
      expect(processQueryMock.calls).toHaveLength(0);
      expect(result).toBe("Local command result");
    });

    it("should process command as query if local handler returns null", async () => {
      testInterface.mockHandleLocalCommand.mockResolvedValue(null);
      
      const result = await testInterface.testHandleInput("/unknown", messageContext);
      
      expect(testInterface.mockHandleLocalCommand.calls).toHaveLength(1);
      expect(testInterface.mockHandleLocalCommand.calls[0]).toEqual(["/unknown", messageContext]);
      expect(processQueryMock.calls).toHaveLength(1);
      expect(processQueryMock.calls[0]).toEqual(["/unknown", messageContext]);
      expect(result).toBe("Processed query result");
    });
  });

  describe("processMessage", () => {
    it("should process message through queue", async () => {
      const result = await testInterface.testProcessMessage("Test message", messageContext);
      
      expect(processQueryMock.calls).toHaveLength(1);
      expect(processQueryMock.calls[0]).toEqual(["Test message", messageContext]);
      expect(result).toBe("Processed query result");
    });

    it("should throw error if processQuery returns falsy", async () => {
      processQueryMock.mockResolvedValue("");
      
      await expect(
        testInterface.testProcessMessage("Test message", messageContext)
      ).rejects.toThrow("No response from query processor");
    });

    it("should handle concurrent messages with rate limiting", async () => {
      // The queue is configured with concurrency: 1, interval: 1000, intervalCap: 10
      // This means max 10 messages per second
      const promises: Promise<string>[] = [];
      
      // Send 15 messages
      for (let i = 0; i < 15; i++) {
        promises.push(testInterface.testProcessMessage(`Message ${i}`, messageContext));
      }
      
      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();
      
      // Should have taken at least 1 second due to rate limiting
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
      expect(processQueryMock.calls).toHaveLength(15);
    });

    it("should process messages in order", async () => {
      // Create a new mock with custom implementation
      const customMock = createMockFn();
      const results: string[] = [];
      
      // Override the mock to track order and return custom results
      const originalFn = customMock;
      mockContext.processQuery = async (query: string, context: MessageContext) => {
        originalFn.calls.push([query, context]);
        await new Promise(resolve => setTimeout(resolve, 50));
        const result = `Result: ${query}`;
        results.push(query);
        return result;
      };
      
      // Re-create test interface with new mock
      testInterface = new TestInterface(mockContext);
      
      const promises = [
        testInterface.testProcessMessage("First", messageContext),
        testInterface.testProcessMessage("Second", messageContext),
        testInterface.testProcessMessage("Third", messageContext),
      ];
      
      const responses = await Promise.all(promises);
      
      expect(responses).toEqual([
        "Result: First",
        "Result: Second", 
        "Result: Third",
      ]);
      
      // Check that calls were made in order
      expect(results).toEqual(["First", "Second", "Third"]);
    });
  });

  describe("abstract methods", () => {
    it("should require implementations to provide start method", async () => {
      await testInterface.start();
      expect(testInterface.startCalled).toBe(true);
    });

    it("should require implementations to provide stop method", async () => {
      await testInterface.stop();
      expect(testInterface.stopCalled).toBe(true);
    });

    it("should require implementations to provide handleLocalCommand method", async () => {
      testInterface.mockHandleLocalCommand.mockResolvedValue("Command handled");
      
      const result = await testInterface.testHandleInput("/test", messageContext);
      
      expect(testInterface.mockHandleLocalCommand.calls).toHaveLength(1);
      expect(testInterface.mockHandleLocalCommand.calls[0]).toEqual(["/test", messageContext]);
      expect(result).toBe("Command handled");
    });
  });

  describe("error handling", () => {
    it("should propagate errors from processQuery", async () => {
      const error = new Error("Query processing failed");
      processQueryMock.mockRejectedValue(error);
      
      await expect(
        testInterface.testProcessMessage("Failing message", messageContext)
      ).rejects.toThrow("Query processing failed");
    });

    it("should propagate errors from handleLocalCommand", async () => {
      const error = new Error("Command handling failed");
      testInterface.mockHandleLocalCommand.mockRejectedValue(error);
      
      await expect(
        testInterface.testHandleInput("/failing", messageContext)
      ).rejects.toThrow("Command handling failed");
    });
  });
});