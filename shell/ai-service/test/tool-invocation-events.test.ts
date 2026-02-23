import { describe, expect, it, mock } from "bun:test";
import {
  createToolExecuteWrapper,
  type ToolEventEmitter,
} from "../src/tool-events";

/**
 * Tests for tool invocation events
 *
 * The tool execute wrapper emits events when tools are invoked:
 * - tool:invoking - Before the tool handler is called
 * - tool:completed - After the tool handler returns successfully
 * - tool:failed - When the tool handler throws an error
 */

// Context info for routing events
const defaultContextInfo = {
  conversationId: "test-conv",
  channelId: "test-channel",
  channelName: "Test Channel",
  interfaceType: "test",
};

// Helper to find event by type with type guard
function findEvent(
  events: Array<{ type: string; payload: unknown }>,
  type: string,
): { type: string; payload: unknown } | undefined {
  return events.find((e) => e.type === type);
}

describe("tool invocation events", () => {
  describe("tool:invoking event", () => {
    it("should emit tool:invoking event before handler executes", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      let handlerExecuted = false;
      const handler = mock(async () => {
        // Check events at time of handler execution
        const invokingEvents = events.filter((e) => e.type === "tool:invoking");
        expect(invokingEvents.length).toBe(1);
        handlerExecuted = true;
        return { status: "ok", data: { result: "success" } };
      });

      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({ query: "test" });

      expect(handlerExecuted).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it("should include toolName and args in tool:invoking event", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => ({ status: "ok", data: {} }));
      const wrapper = createToolExecuteWrapper(
        "search_notes",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({ query: "typescript", limit: 10 });

      const invokingEvent = findEvent(events, "tool:invoking");
      expect(invokingEvent).toBeDefined();

      if (invokingEvent) {
        const payload = invokingEvent.payload as {
          toolName: string;
          args: unknown;
          conversationId: string;
          channelId: string;
          interfaceType: string;
        };

        expect(payload.toolName).toBe("search_notes");
        expect(payload.args).toEqual({ query: "typescript", limit: 10 });
        expect(payload.conversationId).toBe("test-conv");
        expect(payload.channelId).toBe("test-channel");
        expect(payload.interfaceType).toBe("test");
      }
    });

    it("should include contextInfo for routing in tool:invoking event", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => ({ status: "ok", data: {} }));
      const contextInfo = {
        conversationId: "matrix-room-123",
        channelId: "!abc:matrix.org",
        channelName: "General Chat",
        interfaceType: "matrix",
      };

      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        contextInfo,
        emitter,
      );

      await wrapper({});

      const invokingEvent = findEvent(events, "tool:invoking");
      if (invokingEvent) {
        const payload = invokingEvent.payload as {
          conversationId: string;
          channelId: string;
          channelName: string;
          interfaceType: string;
        };

        expect(payload.conversationId).toBe("matrix-room-123");
        expect(payload.channelId).toBe("!abc:matrix.org");
        expect(payload.channelName).toBe("General Chat");
        expect(payload.interfaceType).toBe("matrix");
      }
    });
  });

  describe("tool:completed event", () => {
    it("should emit tool:completed event after handler returns", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => ({
        status: "ok",
        data: { result: "done" },
      }));
      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({});

      const completedEvent = findEvent(events, "tool:completed");
      expect(completedEvent).toBeDefined();

      if (completedEvent) {
        const payload = completedEvent.payload as {
          toolName: string;
          conversationId: string;
        };
        expect(payload.toolName).toBe("test_tool");
        expect(payload.conversationId).toBe("test-conv");
      }
    });

    it("should emit tool:completed after tool:invoking", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => ({ status: "ok", data: {} }));
      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({});

      const eventTypes = events.map((e) => e.type);
      const invokingIndex = eventTypes.indexOf("tool:invoking");
      const completedIndex = eventTypes.indexOf("tool:completed");

      expect(invokingIndex).toBeGreaterThanOrEqual(0);
      expect(completedIndex).toBeGreaterThanOrEqual(0);
      expect(completedIndex).toBeGreaterThan(invokingIndex);
    });

    it("should not emit tool:failed on successful completion", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => ({ status: "ok", data: {} }));
      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({});

      const failedEvent = findEvent(events, "tool:failed");
      expect(failedEvent).toBeUndefined();
    });
  });

  describe("tool:failed event", () => {
    it("should emit tool:failed event when handler throws", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => {
        throw new Error("Tool execution failed");
      });

      const wrapper = createToolExecuteWrapper(
        "failing_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      try {
        await wrapper({});
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Tool execution failed");
      }

      const failedEvent = findEvent(events, "tool:failed");
      expect(failedEvent).toBeDefined();

      if (failedEvent) {
        const payload = failedEvent.payload as {
          toolName: string;
          error: string;
        };
        expect(payload.toolName).toBe("failing_tool");
        expect(payload.error).toBe("Tool execution failed");
      }
    });

    it("should include error message in tool:failed event", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => {
        throw new Error("Connection timeout");
      });

      const wrapper = createToolExecuteWrapper(
        "error_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      try {
        await wrapper({});
        expect.unreachable("Should have thrown");
      } catch {
        // Expected
      }

      const failedEvent = findEvent(events, "tool:failed");
      if (failedEvent) {
        const payload = failedEvent.payload as { error: string };
        expect(payload.error).toBe("Connection timeout");
      }
    });

    it("should emit tool:invoking before tool:failed", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => {
        throw new Error("Failure");
      });

      const wrapper = createToolExecuteWrapper(
        "failing_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      try {
        await wrapper({});
        expect.unreachable("Should have thrown");
      } catch {
        // Expected
      }

      const eventTypes = events.map((e) => e.type);
      const invokingIndex = eventTypes.indexOf("tool:invoking");
      const failedIndex = eventTypes.indexOf("tool:failed");

      expect(invokingIndex).toBeGreaterThanOrEqual(0);
      expect(failedIndex).toBeGreaterThan(invokingIndex);
    });

    it("should not emit tool:completed when tool fails", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async () => {
        throw new Error("Failure");
      });

      const wrapper = createToolExecuteWrapper(
        "failing_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      try {
        await wrapper({});
        expect.unreachable("Should have thrown");
      } catch {
        // Expected
      }

      const completedEvent = findEvent(events, "tool:completed");
      expect(completedEvent).toBeUndefined();
    });

    it("should re-throw the original error after emitting event", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const originalError = new Error("Original error message");
      const handler = mock(async () => {
        throw originalError;
      });

      const wrapper = createToolExecuteWrapper(
        "error_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      try {
        await wrapper({});
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBe(originalError);
      }
    });
  });

  describe("without emitter", () => {
    it("should work without emitter (no events emitted)", async () => {
      const handler = mock(async () => ({ status: "ok", data: {} }));

      // Create wrapper without emitter
      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        undefined,
      );

      const result = await wrapper({ query: "test" });

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ status: "ok", data: {} });
    });

    it("should still throw errors without emitter", async () => {
      const handler = mock(async () => {
        throw new Error("Test error");
      });

      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        undefined,
      );

      try {
        await wrapper({});
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Test error");
      }
    });
  });

  describe("handler result passthrough", () => {
    it("should return the handler result unchanged", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const expectedResult = {
        status: "ok",
        data: { notes: ["note1", "note2"], count: 2 },
        formatted: "Found 2 notes",
      };

      const handler = mock(async () => expectedResult);
      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      const result = await wrapper({ query: "test" });

      expect(result).toEqual(expectedResult);
    });

    it("should pass args to handler correctly", async () => {
      const events: Array<{ type: string; payload: unknown }> = [];
      const emitter: ToolEventEmitter = {
        emit: (type, payload) => {
          events.push({ type, payload });
        },
      };

      const handler = mock(async (args: unknown) => {
        return { status: "ok", data: { receivedArgs: args } };
      });

      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      const inputArgs = { query: "search term", page: 1, limit: 10 };
      const result = (await wrapper(inputArgs)) as {
        status: string;
        data: { receivedArgs: unknown };
      };

      expect(handler).toHaveBeenCalledWith(inputArgs);
      expect(result.data).toEqual({ receivedArgs: inputArgs });
    });
  });
});
