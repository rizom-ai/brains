import { describe, it, expect, beforeEach, mock, afterAll } from "bun:test";
import { CLIInterface } from "../src/cli-interface";
import type { InterfaceContext, MessageContext } from "@brains/interface-core";
import { createSilentLogger } from "@brains/utils";
import type { CLIConfig } from "../src/types";

// Mock console.clear
const originalClear = console.clear;
console.clear = mock(() => {});

// Mock process.exit
const mockExit = mock(() => {});
process.exit = mockExit as any;

describe("CLIInterface", () => {
  let cliInterface: CLIInterface;
  let mockContext: InterfaceContext;
  let processQueryMock: ReturnType<typeof mock>;

  beforeEach(() => {
    mock.restore();
    processQueryMock = mock(() => Promise.resolve("Query processed"));

    mockContext = {
      name: "Test CLI",
      version: "1.0.0",
      logger: createSilentLogger(),
      processQuery: processQueryMock,
    };
  });

  describe("constructor and configuration", () => {
    it("should create instance with context and default config", () => {
      cliInterface = new CLIInterface(mockContext);
      expect(cliInterface.name).toBe("Test CLI");
      expect(cliInterface.version).toBe("1.0.0");
    });

    it("should create instance with custom config", () => {
      const config: CLIConfig = {
        shortcuts: {
          h: "/help",
          q: "/quit",
        },
      };
      cliInterface = new CLIInterface(mockContext, config);
      expect(cliInterface).toBeDefined();
    });
  });

  // Remove handleLocalCommand tests - it's a protected method
  // Test commands through the public processInput method instead

  describe("processInput", () => {
    beforeEach(() => {
      cliInterface = new CLIInterface(mockContext);
    });

    it("should process regular input through handleInput", async () => {
      const responseHandler = mock(() => {});
      cliInterface.on("response", responseHandler);

      await cliInterface.processInput("Hello world");

      expect(processQueryMock).toHaveBeenCalledWith(
        "Hello world",
        expect.any(Object),
      );
      expect(responseHandler).toHaveBeenCalledWith("Query processed");
    });

    it("should handle /help command", async () => {
      const responseHandler = mock(() => {});
      cliInterface.on("response", responseHandler);

      await cliInterface.processInput("/help");

      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("Available commands:"),
      );
    });

    it("should handle /clear command", async () => {
      const responseHandler = mock(() => {});
      cliInterface.on("response", responseHandler);

      await cliInterface.processInput("/clear");

      expect(console.clear).toHaveBeenCalled();
      expect(responseHandler).toHaveBeenCalledWith("");
    });

    it("should emit error event on failure", async () => {
      processQueryMock = mock(() =>
        Promise.reject(new Error("Process failed")),
      );
      mockContext.processQuery = processQueryMock;
      cliInterface = new CLIInterface(mockContext);

      const errorHandler = mock(() => {});
      cliInterface.on("error", errorHandler);

      await cliInterface.processInput("Failing input");

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("event emitter", () => {
    beforeEach(() => {
      cliInterface = new CLIInterface(mockContext);
    });

    it("should support event listeners", () => {
      const responseHandler = mock(() => {});
      const errorHandler = mock(() => {});

      // Test adding listeners
      cliInterface.on("response", responseHandler);
      cliInterface.on("error", errorHandler);

      // Listeners will be called when processInput triggers events
      // We've already tested this in the processInput tests above

      // Test removing listeners
      cliInterface.off("response", responseHandler);
      cliInterface.off("error", errorHandler);
    });
  });

  describe("start and stop", () => {
    beforeEach(() => {
      cliInterface = new CLIInterface(mockContext);
    });

    it("should handle stop when no inkApp", async () => {
      await cliInterface.stop();
      // stop() returns Promise<void>, so we just check it doesn't throw
    });

    // Remove test that accesses private inkApp property
  });
});

// Restore console.clear
afterAll(() => {
  console.clear = originalClear;
});
