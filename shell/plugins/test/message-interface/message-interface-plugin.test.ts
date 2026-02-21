import { describe, it, expect, beforeEach } from "bun:test";
import { MessageInterfacePlugin } from "../../src/message-interface/message-interface-plugin";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import { z } from "@brains/utils";

const testConfigSchema = z.object({
  testOption: z.string().default("default"),
});

class TestMessageInterface extends MessageInterfacePlugin<{
  testOption: string;
}> {
  public sentMessages: Array<{ channelId: string | null; message: string }> =
    [];
  public progressUpdates: JobProgressEvent[] = [];

  constructor() {
    super(
      "test-interface",
      { name: "test-interface", version: "1.0.0" },
      { testOption: "value" },
      testConfigSchema,
    );
  }

  protected override sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void {
    this.sentMessages.push({ channelId, message });
  }

  public get sentResponses(): string[] {
    return this.sentMessages.map((m) => m.message);
  }

  protected override async onProgressUpdate(
    event: JobProgressEvent,
  ): Promise<void> {
    this.progressUpdates.push(event);
  }

  public async testHandleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    await this.handleProgressEvent(event, context);
  }

  public getProgressEventsMap(): Map<string, JobProgressEvent> {
    return this.progressEvents;
  }

  public override startProcessingInput(): void {
    super.startProcessingInput();
  }

  public override endProcessingInput(): void {
    super.endProcessingInput();
  }
}

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

describe("MessageInterfacePlugin", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = new TestMessageInterface();
  });

  describe("progress event handling", () => {
    it("should store progress events in the map", async () => {
      const event = createProgressEvent();

      await plugin.testHandleProgressEvent(event, createJobContext());

      expect(plugin.getProgressEventsMap().has("job-123")).toBe(true);
      expect(plugin.getProgressEventsMap().get("job-123")).toEqual(event);
    });

    it("should call onProgressUpdate for each event", async () => {
      const event = createProgressEvent();

      await plugin.testHandleProgressEvent(event, createJobContext());

      expect(plugin.progressUpdates).toHaveLength(1);
      expect(plugin.progressUpdates[0]).toEqual(event);
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

    it("should filter to processing events on initial registration", () => {
      plugin.getProgressEventsMap().set("completed-job", {
        id: "completed-job",
        type: "job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "completed-job",
        },
      });

      plugin.getProgressEventsMap().set("active-job", {
        id: "active-job",
        type: "job",
        status: "processing",
        metadata: {
          operationType: "content_operations",
          rootJobId: "active-job",
        },
      });

      const receivedEvents: JobProgressEvent[][] = [];
      plugin.registerProgressCallback((events) => {
        receivedEvents.push([...events]);
      });

      expect(receivedEvents[0]).toHaveLength(1);
      expect(receivedEvents[0]?.[0]?.id).toBe("active-job");
    });
  });

  describe("getActiveProgressEvents", () => {
    it("should return only processing events", () => {
      plugin.getProgressEventsMap().set("completed", {
        id: "completed",
        type: "job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "completed",
        },
      });
      plugin.getProgressEventsMap().set("processing", {
        id: "processing",
        type: "job",
        status: "processing",
        metadata: {
          operationType: "content_operations",
          rootJobId: "processing",
        },
      });

      const active = plugin.getActiveProgressEvents();

      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe("processing");
    });
  });
});

describe("MessageInterfacePlugin - background job filtering", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = new TestMessageInterface();
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

describe("MessageInterfacePlugin - completion message ordering", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = new TestMessageInterface();
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

      expect(plugin.progressUpdates).toHaveLength(1);
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
