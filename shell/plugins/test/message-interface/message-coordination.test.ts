import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createMessageCoordinator } from "../../src/message-interface/message-coordination";
import type {
  MessageInterfaceOutput,
  ProgressMessageCoordinator,
} from "../../src/message-interface/progress-message-coordinator";
import type {
  ToolActivityEvent,
  ToolStatusUpdate,
} from "../../src/message-interface";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";

/**
 * A message interface's coordination, recording what it sends and the tool
 * statuses it renders, driven as its subscriptions drive it.
 */
function testMessageInterface(): {
  sentMessages: Array<{
    channelId: string | null;
    message: MessageInterfaceOutput;
  }>;
  toolStatuses: ToolStatusUpdate[];
  readonly sentResponses: MessageInterfaceOutput[];
  testHandleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void>;
  testHandleToolActivityEvent(event: ToolActivityEvent): Promise<void>;
  testHandleAgentResponseToolStatuses(
    response: Parameters<
      ProgressMessageCoordinator["handleAgentResponseToolStatuses"]
    >[0],
  ): Promise<void>;
  getProgressEventsMap(): Map<string, JobProgressEvent>;
  getActiveProgressEvents(): JobProgressEvent[];
  registerProgressCallback(
    callback: (events: JobProgressEvent[]) => void,
  ): void;
  startProcessingInput(): void;
  endProcessingInput(): void;
  shutdown(): Promise<void>;
} {
  const sentMessages: Array<{
    channelId: string | null;
    message: MessageInterfaceOutput;
  }> = [];
  const toolStatuses: ToolStatusUpdate[] = [];
  const progress = createMessageCoordinator({
    id: "test-interface",
    logger: () => createSilentLogger(),
    sendMessageToChannel: ({ channelId, message }): void => {
      sentMessages.push({ channelId, message });
    },
    supportsMessageEditing: () => false,
    handleToolStatusUpdate: async (update): Promise<void> => {
      toolStatuses.push(update);
    },
  });
  return {
    sentMessages,
    toolStatuses,
    get sentResponses(): MessageInterfaceOutput[] {
      return sentMessages.map((sent) => sent.message);
    },
    testHandleProgressEvent: (event) => progress.handleProgressEvent(event),
    testHandleToolActivityEvent: (event) =>
      progress.handleToolActivityEvent(event),
    testHandleAgentResponseToolStatuses: (response) =>
      progress.handleAgentResponseToolStatuses(response, "conv-1"),
    getProgressEventsMap: () =>
      new Map(progress.getProgressEvents().map((event) => [event.id, event])),
    getActiveProgressEvents: () => progress.getActiveProgressEvents(),
    registerProgressCallback: (callback): void => {
      progress.registerProgressCallback(callback);
    },
    startProcessingInput: (): void => {
      progress.startProcessingInput();
    },
    endProcessingInput: (): void => {
      progress.endProcessingInput();
    },
    shutdown: () => progress.close(),
  };
}

type TestMessageInterface = ReturnType<typeof testMessageInterface>;

function createProgressEvent(
  overrides: Partial<JobProgressEvent> = {},
): JobProgressEvent {
  return {
    id: "job-123",
    type: "job",
    status: "processing",
    metadata: {
      operationType: "content_operations",
      rootJobId: "job-123",
      channelId: "test-channel",
    },
    message: "Processing...",
    ...overrides,
  };
}

function createJobContext(overrides: Partial<JobContext> = {}): JobContext {
  return {
    operationType: "content_operations",
    rootJobId: "job-123",
    ...overrides,
  };
}

function contextForEvent(event: JobProgressEvent): JobContext {
  return createJobContext({
    operationType: event.metadata.operationType,
    rootJobId: event.metadata.rootJobId,
  });
}

function createToolActivityEvent(
  overrides: Partial<ToolActivityEvent> = {},
): ToolActivityEvent {
  return {
    type: "tool:invoking",
    toolName: "system_create",
    conversationId: "conv-1",
    interfaceType: "test-interface",
    channelId: "test-channel",
    channelName: "Test Channel",
    ...overrides,
  };
}

describe("message coordination", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = testMessageInterface();
  });

  afterEach(async () => {
    await plugin.shutdown();
  });

  describe("progress event handling", () => {
    it("should store progress events in the map", async () => {
      const event = createProgressEvent();

      await plugin.testHandleProgressEvent(event, createJobContext());

      expect(plugin.getProgressEventsMap().has("job-123")).toBe(true);
      expect(plugin.getProgressEventsMap().get("job-123")).toEqual(event);
    });

    it("should send response on completion", async () => {
      const event = createProgressEvent({ status: "completed" });

      await plugin.testHandleProgressEvent(event, createJobContext());

      expect(plugin.sentResponses).toHaveLength(1);
      expect(plugin.sentResponses[0]).toContain("✅");
      expect(plugin.sentResponses[0]).toContain("completed");
    });

    it("should send response on failure", async () => {
      const event = createProgressEvent({ status: "failed" });

      await plugin.testHandleProgressEvent(event, createJobContext());

      expect(plugin.sentResponses).toHaveLength(1);
      expect(plugin.sentResponses[0]).toContain("❌");
      expect(plugin.sentResponses[0]).toContain("failed");
    });

    it("should clear progress state during terminal shutdown", async () => {
      const event = createProgressEvent({ status: "completed" });
      await plugin.testHandleProgressEvent(event, createJobContext());
      expect(plugin.getProgressEventsMap().has(event.id)).toBe(true);

      await plugin.shutdown();

      expect(plugin.getProgressEventsMap().size).toBe(0);
    });

    it("should NOT send response for processing events", async () => {
      const event = createProgressEvent({ status: "processing" });

      await plugin.testHandleProgressEvent(event, createJobContext());

      expect(plugin.sentResponses).toHaveLength(0);
    });

    it("should update existing event in map on subsequent updates", async () => {
      const event1 = createProgressEvent({
        message: "Step 1",
        progress: { current: 25, total: 100, percentage: 25 },
      });
      const event2 = createProgressEvent({
        message: "Step 2",
        progress: { current: 50, total: 100, percentage: 50 },
      });

      await plugin.testHandleProgressEvent(event1, createJobContext());
      await plugin.testHandleProgressEvent(event2, createJobContext());

      expect(plugin.getProgressEventsMap().size).toBe(1);
      expect(plugin.getProgressEventsMap().get("job-123")?.message).toBe(
        "Step 2",
      );
    });

    it("should track multiple jobs separately", async () => {
      const event1 = createProgressEvent({ id: "job-1" });
      const event2 = createProgressEvent({ id: "job-2" });

      await plugin.testHandleProgressEvent(
        event1,
        createJobContext({ rootJobId: "job-1" }),
      );
      await plugin.testHandleProgressEvent(
        event2,
        createJobContext({ rootJobId: "job-2" }),
      );

      expect(plugin.getProgressEventsMap().size).toBe(2);
      expect(plugin.getProgressEventsMap().has("job-1")).toBe(true);
      expect(plugin.getProgressEventsMap().has("job-2")).toBe(true);
    });
  });

  describe("tool status derivation", () => {
    it("emits running status for matching tool invocations", async () => {
      await plugin.testHandleToolActivityEvent(createToolActivityEvent());

      expect(plugin.toolStatuses).toEqual([
        {
          state: "running",
          toolName: "system_create",
          conversationId: "conv-1",
          interfaceType: "test-interface",
          channelId: "test-channel",
          channelName: "Test Channel",
        },
      ]);
    });

    it("ignores tool activity for other interfaces", async () => {
      await plugin.testHandleToolActivityEvent(
        createToolActivityEvent({ interfaceType: "other-interface" }),
      );

      expect(plugin.toolStatuses).toHaveLength(0);
    });

    it("defers completed status while input is processing until agent response is known", async () => {
      plugin.startProcessingInput();

      await plugin.testHandleToolActivityEvent(
        createToolActivityEvent({ type: "tool:completed" }),
      );

      expect(plugin.toolStatuses).toHaveLength(0);

      await plugin.testHandleAgentResponseToolStatuses({});

      expect(plugin.toolStatuses).toEqual([
        expect.objectContaining({
          state: "completed",
          toolName: "system_create",
          conversationId: "conv-1",
        }),
      ]);
    });

    it("resolves deferred completion as awaiting approval when response has a pending confirmation for that tool", async () => {
      plugin.startProcessingInput();

      await plugin.testHandleToolActivityEvent(
        createToolActivityEvent({ type: "tool:completed" }),
      );
      await plugin.testHandleAgentResponseToolStatuses({
        pendingConfirmations: [
          {
            id: "approval-1",
            toolName: "system_create",
            summary: "Create a note",
            args: {},
          },
        ],
      });

      expect(plugin.toolStatuses).toEqual([
        expect.objectContaining({
          state: "awaiting-approval",
          toolName: "system_create",
          conversationId: "conv-1",
        }),
      ]);
    });

    it("emits failed status immediately and clears matching deferred completion", async () => {
      plugin.startProcessingInput();

      await plugin.testHandleToolActivityEvent(
        createToolActivityEvent({ type: "tool:completed" }),
      );
      await plugin.testHandleToolActivityEvent(
        createToolActivityEvent({ type: "tool:failed", error: "boom" }),
      );
      await plugin.testHandleAgentResponseToolStatuses({});

      expect(plugin.toolStatuses).toEqual([
        expect.objectContaining({
          state: "failed",
          toolName: "system_create",
          error: "boom",
        }),
      ]);
    });
  });

  describe("progress callback", () => {
    it("should notify callback when events change", async () => {
      const receivedEvents: JobProgressEvent[][] = [];
      plugin.registerProgressCallback((events) => {
        receivedEvents.push([...events]);
      });

      const event = createProgressEvent({
        metadata: {
          operationType: "content_operations",
          rootJobId: "job-123",
        },
        message: "Working...",
      });

      await plugin.testHandleProgressEvent(event, createJobContext());

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      const lastUpdate = receivedEvents[receivedEvents.length - 1];
      expect(lastUpdate).toHaveLength(1);
    });

    it("should filter to processing events on initial registration", async () => {
      // No channelId, so these are background jobs: state is tracked but
      // nothing is delivered.
      await plugin.testHandleProgressEvent(
        {
          id: "completed-job",
          type: "job",
          status: "completed",
          metadata: {
            operationType: "content_operations",
            rootJobId: "completed-job",
          },
        },
        createJobContext(),
      );

      await plugin.testHandleProgressEvent(
        {
          id: "active-job",
          type: "job",
          status: "processing",
          metadata: {
            operationType: "content_operations",
            rootJobId: "active-job",
          },
        },
        createJobContext(),
      );

      const receivedEvents: JobProgressEvent[][] = [];
      plugin.registerProgressCallback((events) => {
        receivedEvents.push([...events]);
      });

      expect(receivedEvents[0]).toHaveLength(1);
      expect(receivedEvents[0]?.[0]?.id).toBe("active-job");
    });
  });

  describe("getActiveProgressEvents", () => {
    it("should return only processing events", async () => {
      await plugin.testHandleProgressEvent(
        {
          id: "completed",
          type: "job",
          status: "completed",
          metadata: {
            operationType: "content_operations",
            rootJobId: "completed",
          },
        },
        createJobContext(),
      );
      await plugin.testHandleProgressEvent(
        {
          id: "processing",
          type: "job",
          status: "processing",
          metadata: {
            operationType: "content_operations",
            rootJobId: "processing",
          },
        },
        createJobContext(),
      );

      const active = plugin.getActiveProgressEvents();

      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe("processing");
    });
  });
});

describe("message coordination - background job filtering", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = testMessageInterface();
  });

  it("should NOT send messages for background jobs without channelId", async () => {
    const event = createProgressEvent({
      id: "background-job",
      status: "completed",
      metadata: {
        operationType: "data_processing",
        rootJobId: "background-job",
      },
    });

    await plugin.testHandleProgressEvent(event, contextForEvent(event));

    expect(plugin.sentMessages).toHaveLength(0);
  });

  it("should send messages for jobs with explicit channelId", async () => {
    const event = createProgressEvent({
      id: "user-job",
      status: "completed",
      metadata: {
        operationType: "content_operations",
        rootJobId: "user-job",
        channelId: "!room123:matrix.org",
      },
    });

    await plugin.testHandleProgressEvent(event, contextForEvent(event));

    expect(plugin.sentMessages).toHaveLength(1);
    expect(plugin.sentMessages[0]?.channelId).toBe("!room123:matrix.org");
  });

  it("should still track progress state for background jobs", async () => {
    const event = createProgressEvent({
      id: "background-job",
      status: "processing",
      metadata: {
        operationType: "data_processing",
        rootJobId: "background-job",
      },
      message: "Extracting topics...",
    });

    await plugin.testHandleProgressEvent(event, contextForEvent(event));

    expect(plugin.getProgressEventsMap().has("background-job")).toBe(true);
    expect(plugin.sentMessages).toHaveLength(0);
  });

  it("should filter events by interfaceType when specified", async () => {
    const event = createProgressEvent({
      id: "other-interface-job",
      status: "completed",
      metadata: {
        operationType: "content_operations",
        rootJobId: "other-interface-job",
        interfaceType: "cli",
      },
    });

    await plugin.testHandleProgressEvent(event, contextForEvent(event));

    expect(plugin.getProgressEventsMap().has("other-interface-job")).toBe(
      false,
    );
    expect(plugin.sentMessages).toHaveLength(0);
  });
});

describe("message coordination - completion message ordering", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = testMessageInterface();
  });

  describe("input processing lifecycle", () => {
    it("should buffer completion messages while processing input", async () => {
      plugin.startProcessingInput();

      const event = createProgressEvent({
        id: "fast-job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "fast-job",
          channelId: "test-channel",
        },
      });

      await plugin.testHandleProgressEvent(event, contextForEvent(event));

      expect(plugin.sentResponses).toHaveLength(0);

      plugin.endProcessingInput();

      expect(plugin.sentResponses).toHaveLength(1);
      expect(plugin.sentResponses[0]).toContain("✅");
    });

    it("should send completions immediately when NOT processing input", async () => {
      const event = createProgressEvent({
        id: "fast-job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "fast-job",
          channelId: "test-channel",
        },
      });

      await plugin.testHandleProgressEvent(event, contextForEvent(event));

      expect(plugin.sentResponses).toHaveLength(1);
      expect(plugin.sentResponses[0]).toContain("✅");
    });

    it("should still show progress events while processing input", async () => {
      plugin.startProcessingInput();

      const event = createProgressEvent({
        status: "processing",
        metadata: {
          operationType: "content_operations",
          rootJobId: "job-123",
        },
        message: "Working...",
        progress: { current: 50, total: 100, percentage: 50 },
      });

      await plugin.testHandleProgressEvent(event, contextForEvent(event));

      expect(plugin.getProgressEventsMap().has("job-123")).toBe(true);

      plugin.endProcessingInput();
    });

    it("should flush multiple buffered completions in order", async () => {
      plugin.startProcessingInput();

      const completion1 = createProgressEvent({
        id: "job-1",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "job-1",
          channelId: "test-channel",
        },
      });
      const completion2 = createProgressEvent({
        id: "job-2",
        status: "completed",
        metadata: {
          operationType: "data_processing",
          rootJobId: "job-2",
          channelId: "test-channel",
        },
      });

      await plugin.testHandleProgressEvent(
        completion1,
        contextForEvent(completion1),
      );
      await plugin.testHandleProgressEvent(
        completion2,
        contextForEvent(completion2),
      );

      expect(plugin.sentResponses).toHaveLength(0);

      plugin.endProcessingInput();

      expect(plugin.sentResponses).toHaveLength(2);
      expect(plugin.sentResponses[0]).toContain("content operations");
      expect(plugin.sentResponses[1]).toContain("data processing");
    });

    it("should handle mixed completions and failures", async () => {
      plugin.startProcessingInput();

      const completion = createProgressEvent({
        id: "good-job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "good-job",
          channelId: "test-channel",
        },
      });
      const failure = createProgressEvent({
        id: "bad-job",
        status: "failed",
        metadata: {
          operationType: "data_processing",
          rootJobId: "bad-job",
          channelId: "test-channel",
        },
      });

      await plugin.testHandleProgressEvent(
        completion,
        contextForEvent(completion),
      );
      await plugin.testHandleProgressEvent(failure, contextForEvent(failure));

      plugin.endProcessingInput();

      expect(plugin.sentResponses).toHaveLength(2);
      expect(plugin.sentResponses[0]).toContain("✅");
      expect(plugin.sentResponses[1]).toContain("❌");
    });
  });
});
