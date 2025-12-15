import { describe, it, expect, beforeEach } from "bun:test";
import { MessageInterfacePlugin } from "../../src/message-interface/message-interface-plugin";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import { z } from "@brains/utils";

// Config schema for test plugin
const testConfigSchema = z.object({
  testOption: z.string().default("default"),
});

/**
 * Test implementation of MessageInterfacePlugin
 */
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

  // Helper to get just the messages (for backward compatibility with tests)
  public get sentResponses(): string[] {
    return this.sentMessages.map((m) => m.message);
  }

  protected override async onProgressUpdate(
    event: JobProgressEvent,
  ): Promise<void> {
    this.progressUpdates.push(event);
  }

  // Expose protected methods for testing
  public async testHandleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    await this.handleProgressEvent(event, context);
  }

  public getProgressEventsMap(): Map<string, JobProgressEvent> {
    return this.progressEvents;
  }

  // Expose input processing lifecycle methods
  public override startProcessingInput(): void {
    super.startProcessingInput();
  }

  public override endProcessingInput(): void {
    super.endProcessingInput();
  }
}

describe("MessageInterfacePlugin", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = new TestMessageInterface();
  });

  describe("progress event handling", () => {
    const createProgressEvent = (
      overrides: Partial<JobProgressEvent> = {},
    ): JobProgressEvent => ({
      id: "job-123",
      type: "job",
      status: "processing",
      metadata: {
        operationType: "content_operations",
        rootJobId: "job-123",
        channelId: "test-channel", // Explicit channelId for tests
      },
      message: "Processing...",
      ...overrides,
    });

    const defaultContext: JobContext = {
      operationType: "content_operations",
      rootJobId: "job-123",
    };

    it("should store progress events in the map", async () => {
      const event = createProgressEvent();

      await plugin.testHandleProgressEvent(event, defaultContext);

      expect(plugin.getProgressEventsMap().has("job-123")).toBe(true);
      expect(plugin.getProgressEventsMap().get("job-123")).toEqual(event);
    });

    it("should call onProgressUpdate for each event", async () => {
      const event = createProgressEvent();

      await plugin.testHandleProgressEvent(event, defaultContext);

      expect(plugin.progressUpdates).toHaveLength(1);
      expect(plugin.progressUpdates[0]).toEqual(event);
    });

    it("should send response on completion", async () => {
      const event = createProgressEvent({
        status: "completed",
      });

      await plugin.testHandleProgressEvent(event, defaultContext);

      expect(plugin.sentResponses).toHaveLength(1);
      expect(plugin.sentResponses[0]).toContain("✅");
      expect(plugin.sentResponses[0]).toContain("completed");
    });

    it("should send response on failure", async () => {
      const event = createProgressEvent({
        status: "failed",
      });

      await plugin.testHandleProgressEvent(event, defaultContext);

      expect(plugin.sentResponses).toHaveLength(1);
      expect(plugin.sentResponses[0]).toContain("❌");
      expect(plugin.sentResponses[0]).toContain("failed");
    });

    it("should NOT send response for processing events", async () => {
      const event = createProgressEvent({
        status: "processing",
      });

      await plugin.testHandleProgressEvent(event, defaultContext);

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

      await plugin.testHandleProgressEvent(event1, defaultContext);
      await plugin.testHandleProgressEvent(event2, defaultContext);

      expect(plugin.getProgressEventsMap().size).toBe(1);
      expect(plugin.getProgressEventsMap().get("job-123")?.message).toBe(
        "Step 2",
      );
    });

    it("should track multiple jobs separately", async () => {
      const event1 = createProgressEvent({ id: "job-1" });
      const event2 = createProgressEvent({ id: "job-2" });

      await plugin.testHandleProgressEvent(event1, {
        ...defaultContext,
        rootJobId: "job-1",
      });
      await plugin.testHandleProgressEvent(event2, {
        ...defaultContext,
        rootJobId: "job-2",
      });

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

      const event = {
        id: "job-123",
        type: "job" as const,
        status: "processing" as const,
        metadata: {
          operationType: "content_operations" as const,
          rootJobId: "job-123",
        },
        message: "Working...",
      };

      await plugin.testHandleProgressEvent(event, {
        operationType: "content_operations",
        rootJobId: "job-123",
      });

      // Should have received initial empty state + one update
      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      const lastUpdate = receivedEvents[receivedEvents.length - 1];
      expect(lastUpdate).toHaveLength(1);
    });

    it("should filter to processing events on initial registration", () => {
      // Add a completed event first
      plugin.getProgressEventsMap().set("completed-job", {
        id: "completed-job",
        type: "job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "completed-job",
        },
      });

      // Add a processing event
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

      // Initial callback should only include processing events
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
  /**
   * Background jobs (like auto topic extraction) should NOT send progress/completion
   * messages to chat rooms unless they explicitly have a channelId set.
   *
   * This prevents rate limiting errors when many background jobs are running.
   */

  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = new TestMessageInterface();
  });

  it("should NOT send messages for background jobs without channelId", async () => {
    // Background job - no channelId in metadata
    const backgroundEvent: JobProgressEvent = {
      id: "background-job",
      type: "job",
      status: "completed",
      metadata: {
        operationType: "data_processing",
        rootJobId: "background-job",
        // No channelId - this is a background job
      },
    };

    await plugin.testHandleProgressEvent(backgroundEvent, {
      operationType: "data_processing",
      rootJobId: "background-job",
    });

    // Should NOT send any message since no explicit channelId
    expect(plugin.sentMessages).toHaveLength(0);
  });

  it("should send messages for jobs with explicit channelId", async () => {
    // User-triggered job - has explicit channelId
    const userJobEvent: JobProgressEvent = {
      id: "user-job",
      type: "job",
      status: "completed",
      metadata: {
        operationType: "content_operations",
        rootJobId: "user-job",
        channelId: "!room123:matrix.org", // Explicit channel
      },
    };

    await plugin.testHandleProgressEvent(userJobEvent, {
      operationType: "content_operations",
      rootJobId: "user-job",
    });

    // Should send message to the explicit channel
    expect(plugin.sentMessages).toHaveLength(1);
    expect(plugin.sentMessages[0]?.channelId).toBe("!room123:matrix.org");
  });

  it("should still track progress state for background jobs", async () => {
    // Background jobs should still update the progress state map
    // (for UI progress indicators) even if they don't send messages
    const backgroundEvent: JobProgressEvent = {
      id: "background-job",
      type: "job",
      status: "processing",
      metadata: {
        operationType: "data_processing",
        rootJobId: "background-job",
      },
      message: "Extracting topics...",
    };

    await plugin.testHandleProgressEvent(backgroundEvent, {
      operationType: "data_processing",
      rootJobId: "background-job",
    });

    // Progress state should be tracked
    expect(plugin.getProgressEventsMap().has("background-job")).toBe(true);
    // But no message should be sent
    expect(plugin.sentMessages).toHaveLength(0);
  });

  it("should filter events by interfaceType when specified", async () => {
    // Event explicitly targeting a different interface
    const otherInterfaceEvent: JobProgressEvent = {
      id: "other-interface-job",
      type: "job",
      status: "completed",
      metadata: {
        operationType: "content_operations",
        rootJobId: "other-interface-job",
        interfaceType: "cli", // Different interface
      },
    };

    await plugin.testHandleProgressEvent(otherInterfaceEvent, {
      operationType: "content_operations",
      rootJobId: "other-interface-job",
    });

    // Should not process event for different interface
    expect(plugin.getProgressEventsMap().has("other-interface-job")).toBe(
      false,
    );
    expect(plugin.sentMessages).toHaveLength(0);
  });
});

describe("MessageInterfacePlugin - completion message ordering", () => {
  /**
   * This test documents the expected behavior for completion message ordering.
   *
   * Scenario: User triggers a job via agent, job completes before agent response
   *
   * Expected order:
   * 1. User input
   * 2. Agent response (e.g., "Job queued with ID xyz")
   * 3. Completion message (e.g., "✅ content_operations completed")
   *
   * The challenge: Jobs started during input processing may complete before
   * the agent finishes formulating its response. Completion messages should
   * be buffered until after the agent response is sent.
   */

  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = new TestMessageInterface();
  });

  describe("input processing lifecycle", () => {
    it("should buffer completion messages while processing input", async () => {
      // Start processing - any completions should be buffered
      plugin.startProcessingInput();

      const completionEvent: JobProgressEvent = {
        id: "fast-job",
        type: "job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "fast-job",
          channelId: "test-channel", // Explicit channelId required
        },
      };

      await plugin.testHandleProgressEvent(completionEvent, {
        operationType: "content_operations",
        rootJobId: "fast-job",
      });

      // Should NOT be sent yet - buffered
      expect(plugin.sentResponses).toHaveLength(0);

      // End processing - buffered messages should be flushed
      plugin.endProcessingInput();

      // Now the completion should be sent
      expect(plugin.sentResponses).toHaveLength(1);
      expect(plugin.sentResponses[0]).toContain("✅");
    });

    it("should send completions immediately when NOT processing input", async () => {
      // Not processing - completions should be sent immediately
      const completionEvent: JobProgressEvent = {
        id: "fast-job",
        type: "job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "fast-job",
          channelId: "test-channel", // Explicit channelId required
        },
      };

      await plugin.testHandleProgressEvent(completionEvent, {
        operationType: "content_operations",
        rootJobId: "fast-job",
      });

      // Should be sent immediately
      expect(plugin.sentResponses).toHaveLength(1);
      expect(plugin.sentResponses[0]).toContain("✅");
    });

    it("should still show progress events while processing input", async () => {
      plugin.startProcessingInput();

      const progressEvent: JobProgressEvent = {
        id: "job-123",
        type: "job",
        status: "processing",
        metadata: {
          operationType: "content_operations",
          rootJobId: "job-123",
        },
        message: "Working...",
        progress: { current: 50, total: 100, percentage: 50 },
      };

      await plugin.testHandleProgressEvent(progressEvent, {
        operationType: "content_operations",
        rootJobId: "job-123",
      });

      // Progress events are NOT buffered - they should update the UI in real-time
      // Only completion/failure messages are buffered
      expect(plugin.progressUpdates).toHaveLength(1);
      expect(plugin.getProgressEventsMap().has("job-123")).toBe(true);

      plugin.endProcessingInput();
    });

    it("should flush multiple buffered completions in order", async () => {
      plugin.startProcessingInput();

      // Two jobs complete during processing
      const completion1: JobProgressEvent = {
        id: "job-1",
        type: "job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "job-1",
          channelId: "test-channel",
        },
      };
      const completion2: JobProgressEvent = {
        id: "job-2",
        type: "job",
        status: "completed",
        metadata: {
          operationType: "data_processing",
          rootJobId: "job-2",
          channelId: "test-channel",
        },
      };

      await plugin.testHandleProgressEvent(completion1, {
        operationType: "content_operations",
        rootJobId: "job-1",
      });
      await plugin.testHandleProgressEvent(completion2, {
        operationType: "data_processing",
        rootJobId: "job-2",
      });

      // Neither should be sent yet
      expect(plugin.sentResponses).toHaveLength(0);

      plugin.endProcessingInput();

      // Both should be sent, in order
      expect(plugin.sentResponses).toHaveLength(2);
      expect(plugin.sentResponses[0]).toContain("content operations");
      expect(plugin.sentResponses[1]).toContain("data processing");
    });

    it("should handle mixed completions and failures", async () => {
      plugin.startProcessingInput();

      const completion: JobProgressEvent = {
        id: "good-job",
        type: "job",
        status: "completed",
        metadata: {
          operationType: "content_operations",
          rootJobId: "good-job",
          channelId: "test-channel",
        },
      };
      const failure: JobProgressEvent = {
        id: "bad-job",
        type: "job",
        status: "failed",
        metadata: {
          operationType: "data_processing",
          rootJobId: "bad-job",
          channelId: "test-channel",
        },
      };

      await plugin.testHandleProgressEvent(completion, {
        operationType: "content_operations",
        rootJobId: "good-job",
      });
      await plugin.testHandleProgressEvent(failure, {
        operationType: "data_processing",
        rootJobId: "bad-job",
      });

      plugin.endProcessingInput();

      expect(plugin.sentResponses).toHaveLength(2);
      expect(plugin.sentResponses[0]).toContain("✅");
      expect(plugin.sentResponses[1]).toContain("❌");
    });
  });
});
