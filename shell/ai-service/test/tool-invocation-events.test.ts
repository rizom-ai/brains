import { describe, expect, it, mock } from "bun:test";
import {
  createMessageBusEmitter,
  createToolExecuteWrapper,
  type ToolEventEmitter,
} from "../src/tool-events";
import { z } from "@brains/utils/zod";

/**
 * The tool-event payload fields these tests read.
 *
 * Parsing rather than asserting means an emitter that stops carrying `actor`
 * or `error` fails here, instead of comparing undefined to the expectation.
 */
const toolEventPayloadSchema = z.looseObject({
  toolName: z.string(),
  args: z.unknown().optional(),
  conversationId: z.string().optional(),
  channelId: z.string().optional(),
  interfaceType: z.string().optional(),
  actor: z.unknown().optional(),
  channelName: z.string().optional(),
  displayName: z.string().optional(),
  error: z.string().optional(),
});

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

interface RecordedEvent {
  type: string;
  payload: unknown;
}

interface EventRecorder {
  emitter: ToolEventEmitter;
  events: RecordedEvent[];
  /** Event types in emission order — the whole sequence is asserted, not sampled. */
  types: () => string[];
}

function recordEvents(): EventRecorder {
  const events: RecordedEvent[] = [];
  return {
    events,
    types: (): string[] => events.map((e) => e.type),
    emitter: {
      emit: (type, payload): void => {
        events.push({ type, payload });
      },
    },
  };
}

/**
 * The Error a call rejects with, failing the test if it resolves instead.
 *
 * Returning the error lets callers assert on it directly. A try/catch around
 * the call would swallow the "should have thrown" assertion along with it.
 */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  const settled = await promise.then(
    (value) => ({ rejected: false as const, value }),
    (error: unknown) => ({ rejected: true as const, error }),
  );
  if (!settled.rejected) {
    throw new Error(
      `Expected the call to reject, but it resolved with ${JSON.stringify(settled.value)}`,
    );
  }
  if (!(settled.error instanceof Error)) {
    throw new Error(
      `Expected a rejection with an Error, got ${String(settled.error)}`,
    );
  }
  return settled.error;
}

/**
 * Parsed payload of the first event of `type`, throwing when it was never
 * emitted.
 *
 * A missing event fails the test loudly; narrowing at the call site would let
 * the assertions be skipped instead — exactly the case these tests exist to
 * catch. Parsing rather than asserting the payload means an emitter that
 * stops carrying a field fails here too.
 */
function expectEvent(
  events: RecordedEvent[],
  type: string,
): z.output<typeof toolEventPayloadSchema> {
  const match = events.find((e) => e.type === type);
  if (!match) {
    throw new Error(
      `Expected a "${type}" event, but only got: [${events
        .map((e) => e.type)
        .join(", ")}]`,
    );
  }
  return toolEventPayloadSchema.parse(match.payload);
}

describe("tool invocation events", () => {
  describe("tool:invoking event", () => {
    it("should emit tool:invoking event before handler executes", async () => {
      const { emitter, events } = recordEvents();

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
      const { emitter, events } = recordEvents();

      const handler = mock(async () => ({ status: "ok", data: {} }));
      const wrapper = createToolExecuteWrapper(
        "search_notes",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({ query: "typescript", limit: 10 });

      const payload = expectEvent(events, "tool:invoking");

      expect(payload.toolName).toBe("search_notes");
      expect(payload.args).toEqual({ query: "typescript", limit: 10 });
      expect(payload.conversationId).toBe("test-conv");
      expect(payload.channelId).toBe("test-channel");
      expect(payload.interfaceType).toBe("test");
      expect(payload.actor).toEqual({
        kind: "agent",
        agentId: "brain-agent",
      });
    });

    it("should include contextInfo for routing in tool:invoking event", async () => {
      const { emitter, events } = recordEvents();

      const handler = mock(async () => ({ status: "ok", data: {} }));
      const contextInfo = {
        conversationId: "matrix-room-123",
        channelId: "!abc:matrix.org",
        channelName: "General Chat",
        interfaceType: "matrix",
        actor: {
          kind: "user" as const,
          userId: "usr_mira",
          canonicalId: "user:mira",
        },
        displayName: "Mira",
      };

      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        contextInfo,
        emitter,
      );

      await wrapper({});

      const payload = expectEvent(events, "tool:invoking");

      expect(payload.conversationId).toBe("matrix-room-123");
      expect(payload.channelId).toBe("!abc:matrix.org");
      expect(payload.channelName).toBe("General Chat");
      expect(payload.interfaceType).toBe("matrix");
      expect(payload.actor).toEqual({
        kind: "user",
        userId: "usr_mira",
        canonicalId: "user:mira",
      });
      expect(payload.displayName).toBe("Mira");
    });
  });

  describe("tool:completed event", () => {
    it("should emit tool:completed event after handler returns", async () => {
      const { emitter, events } = recordEvents();

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

      const payload = expectEvent(events, "tool:completed");
      expect(payload.toolName).toBe("test_tool");
      expect(payload.conversationId).toBe("test-conv");
    });

    it("should emit tool:completed after tool:invoking", async () => {
      const { emitter, types } = recordEvents();

      const handler = mock(async () => ({ status: "ok", data: {} }));
      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({});

      expect(types()).toEqual(["tool:invoking", "tool:completed"]);
    });

    it("should not emit tool:failed on successful completion", async () => {
      const { emitter, types } = recordEvents();

      const handler = mock(async () => ({ status: "ok", data: {} }));
      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({});

      expect(types()).not.toContain("tool:failed");
    });
  });

  describe("tool:failed event", () => {
    it("should emit tool:failed event when handler throws", async () => {
      const { emitter, events } = recordEvents();

      const handler = mock(async () => {
        throw new Error("Tool execution failed");
      });

      const wrapper = createToolExecuteWrapper(
        "failing_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      const error = await rejection(wrapper({}));
      expect(error.message).toBe("Tool execution failed");

      const payload = expectEvent(events, "tool:failed");
      expect(payload.toolName).toBe("failing_tool");
      expect(payload.error).toBe("Tool execution failed");
    });

    it("should include error message in tool:failed event", async () => {
      const { emitter, events } = recordEvents();

      const handler = mock(async () => {
        throw new Error("Connection timeout");
      });

      const wrapper = createToolExecuteWrapper(
        "error_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      const error = await rejection(wrapper({}));
      expect(error.message).toBe("Connection timeout");

      const payload = expectEvent(events, "tool:failed");
      expect(payload.error).toBe("Connection timeout");
    });

    it("should emit tool:invoking before tool:failed", async () => {
      const { emitter, types } = recordEvents();

      const handler = mock(async () => {
        throw new Error("Failure");
      });

      const wrapper = createToolExecuteWrapper(
        "failing_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      expect((await rejection(wrapper({}))).message).toBe("Failure");

      expect(types()).toEqual(["tool:invoking", "tool:failed"]);
    });

    it("should not emit tool:completed when tool fails", async () => {
      const { emitter, types } = recordEvents();

      const handler = mock(async () => {
        throw new Error("Failure");
      });

      const wrapper = createToolExecuteWrapper(
        "failing_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      expect((await rejection(wrapper({}))).message).toBe("Failure");

      expect(types()).not.toContain("tool:completed");
    });

    it("should re-throw the original error after emitting event", async () => {
      const { emitter } = recordEvents();

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

      // Identity, not just message: the wrapper must not wrap or replace it.
      expect(await rejection(wrapper({}))).toBe(originalError);
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

      const error = await rejection(wrapper({}));
      expect(error.message).toBe("Test error");
    });
  });

  describe("message bus emitter", () => {
    it("broadcasts tool events to all interface subscribers", async () => {
      const send = mock(async () => ({ success: true }));
      const emitter = createMessageBusEmitter({ send });

      await emitter.emit("tool:invoking", { toolName: "test_tool" });

      expect(send).toHaveBeenCalledWith({
        type: "tool:invoking",
        payload: { toolName: "test_tool" },
        sender: "brain-agent",
        broadcast: true,
      });
    });

    it("should ignore rejected sends", async () => {
      const send = mock(async () => {
        throw new Error("bus unavailable");
      });
      const emitter = createMessageBusEmitter({ send });

      await emitter.emit("tool:invoking", { toolName: "test_tool" });

      expect(send).toHaveBeenCalledWith({
        type: "tool:invoking",
        payload: { toolName: "test_tool" },
        sender: "brain-agent",
        broadcast: true,
      });
    });

    it("awaits invoking event delivery before executing the tool", async () => {
      const order: string[] = [];
      const emitter: ToolEventEmitter = {
        emit: async (type) => {
          await Promise.resolve();
          order.push(`${type} delivered`);
        },
      };
      const handler = mock(async () => {
        order.push("handler executed");
        return { success: true };
      });

      const wrapper = createToolExecuteWrapper(
        "test_tool",
        handler,
        defaultContextInfo,
        emitter,
      );

      await wrapper({});

      expect(order).toEqual([
        "tool:invoking delivered",
        "handler executed",
        "tool:completed delivered",
      ]);
    });
  });

  describe("handler result passthrough", () => {
    it("should return the handler result unchanged", async () => {
      const { emitter } = recordEvents();

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
      const { emitter } = recordEvents();

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
      const result = z
        .looseObject({
          status: z.string(),
          data: z.looseObject({ receivedArgs: z.unknown() }),
        })
        .parse(await wrapper(inputArgs));

      expect(handler).toHaveBeenCalledWith(inputArgs);
      expect(result.data).toEqual({ receivedArgs: inputArgs });
    });
  });
});
