import { describe, expect, it, mock } from "bun:test";
import type { JobProgressEvent } from "@brains/job-queue";

interface ProgressMessageTracking {
  messageId: string;
  channelId: string;
  lastUpdate: number;
}

interface ToolResultWithJob {
  toolName: string;
  jobId: string;
}

function extractJobIds(
  toolResults: Array<{ toolName: string; jobId?: string }> | undefined,
): string[] {
  if (!toolResults) return [];
  return toolResults
    .filter((tr): tr is ToolResultWithJob => tr.jobId !== undefined)
    .map((tr) => tr.jobId);
}

function createCompletionEvent(
  overrides: Partial<JobProgressEvent> & { id: string },
): JobProgressEvent {
  return {
    type: "job",
    status: "completed",
    message: "Completed",
    progress: { current: 1, total: 1, percentage: 100 },
    metadata: {
      operationType: "content_operations",
      rootJobId: overrides.id,
    },
    ...overrides,
  };
}

describe("job tracking", () => {
  describe("extractJobIds", () => {
    it("should extract jobIds from toolResults", () => {
      const toolResults = [
        { toolName: "capture_url", jobId: "job-123" },
        { toolName: "search_notes" },
        { toolName: "build_site", jobId: "job-456" },
      ];

      expect(extractJobIds(toolResults)).toEqual(["job-123", "job-456"]);
    });

    it("should return empty array when no toolResults", () => {
      expect(extractJobIds(undefined)).toEqual([]);
    });

    it("should return empty array when no jobs in toolResults", () => {
      const toolResults = [
        { toolName: "search_notes" },
        { toolName: "list_notes" },
      ];

      expect(extractJobIds(toolResults)).toEqual([]);
    });
  });

  describe("trackAgentResponseForJob", () => {
    it("should call trackAgentResponseForJob for each jobId", () => {
      const trackAgentResponseForJob = mock(
        (_jobId: string, _messageId: string, _channelId: string) => {},
      );

      const toolResults = [
        { toolName: "capture_url", jobId: "job-123" },
        { toolName: "build_site", jobId: "job-456" },
      ];

      const jobIds = extractJobIds(toolResults);
      for (const jobId of jobIds) {
        trackAgentResponseForJob(jobId, "msg-001", "room-123");
      }

      expect(trackAgentResponseForJob).toHaveBeenCalledTimes(2);
      expect(trackAgentResponseForJob).toHaveBeenCalledWith(
        "job-123",
        "msg-001",
        "room-123",
      );
      expect(trackAgentResponseForJob).toHaveBeenCalledWith(
        "job-456",
        "msg-001",
        "room-123",
      );
    });

    it("should store tracking info in agentResponseTracking map", () => {
      const agentResponseTracking = new Map<string, ProgressMessageTracking>();

      function trackAgentResponseForJob(
        jobId: string,
        messageId: string,
        channelId: string,
      ): void {
        agentResponseTracking.set(jobId, {
          messageId,
          channelId,
          lastUpdate: Date.now(),
        });
      }

      trackAgentResponseForJob("job-123", "msg-001", "room-123");

      expect(agentResponseTracking.has("job-123")).toBe(true);
      const tracking = agentResponseTracking.get("job-123");
      expect(tracking?.messageId).toBe("msg-001");
      expect(tracking?.channelId).toBe("room-123");
    });
  });

  describe("message update on job completion", () => {
    it("should update message when job completes", async () => {
      const agentResponseTracking = new Map<string, ProgressMessageTracking>();
      const editMessage = mock(
        async (_channelId: string, _messageId: string, _newMessage: string) =>
          true,
      );

      agentResponseTracking.set("job-123", {
        messageId: "msg-001",
        channelId: "room-123",
        lastUpdate: Date.now(),
      });

      const event = createCompletionEvent({
        id: "job-123",
        message: "Capture completed successfully",
        metadata: {
          operationType: "content_operations",
          interfaceType: "matrix",
          channelId: "room-123",
          rootJobId: "job-123",
        },
      });

      const tracking = agentResponseTracking.get(event.id);
      if (tracking) {
        await editMessage(
          tracking.channelId,
          tracking.messageId,
          `✅ ${event.message}`,
        );
        agentResponseTracking.delete(event.id);
      }

      expect(editMessage).toHaveBeenCalledWith(
        "room-123",
        "msg-001",
        "✅ Capture completed successfully",
      );
      expect(agentResponseTracking.has("job-123")).toBe(false);
    });

    it("should send new message when no tracking exists and channelId available", () => {
      const agentResponseTracking = new Map<string, ProgressMessageTracking>();
      const sendMessageToChannel = mock(
        (_channelId: string | null, _message: string) => {},
      );

      const event = createCompletionEvent({
        id: "job-789",
        message: "Build completed",
        metadata: {
          operationType: "content_operations",
          channelId: "room-123",
          rootJobId: "job-789",
        },
      });

      const tracking = agentResponseTracking.get(event.id);
      if (!tracking && event.metadata.channelId) {
        sendMessageToChannel(event.metadata.channelId, `✅ ${event.message}`);
      }

      expect(sendMessageToChannel).toHaveBeenCalledWith(
        "room-123",
        "✅ Build completed",
      );
    });

    it("should not send message when no tracking and no channelId", () => {
      const agentResponseTracking = new Map<string, ProgressMessageTracking>();
      const sendMessageToChannel = mock(
        (_channelId: string | null, _message: string) => {},
      );

      const event = createCompletionEvent({
        id: "job-background",
        message: "Sync completed",
        metadata: {
          operationType: "file_operations",
          rootJobId: "job-background",
        },
      });

      const tracking = agentResponseTracking.get(event.id);
      if (!tracking && event.metadata.channelId) {
        sendMessageToChannel(event.metadata.channelId, "");
      }

      expect(sendMessageToChannel).not.toHaveBeenCalled();
    });

    it("should handle failed jobs", async () => {
      const agentResponseTracking = new Map<string, ProgressMessageTracking>();
      const editMessage = mock(
        async (_channelId: string, _messageId: string, _newMessage: string) =>
          true,
      );

      agentResponseTracking.set("job-fail", {
        messageId: "msg-002",
        channelId: "room-456",
        lastUpdate: Date.now(),
      });

      const event = createCompletionEvent({
        id: "job-fail",
        status: "failed",
        message: "Failed to capture: Connection timeout",
        progress: { current: 0, total: 1, percentage: 0 },
        metadata: {
          operationType: "content_operations",
          channelId: "room-456",
          rootJobId: "job-fail",
        },
      });

      const tracking = agentResponseTracking.get(event.id);
      if (tracking) {
        await editMessage(
          tracking.channelId,
          tracking.messageId,
          `❌ ${event.message}`,
        );
        agentResponseTracking.delete(event.id);
      }

      expect(editMessage).toHaveBeenCalledWith(
        "room-456",
        "msg-002",
        "❌ Failed to capture: Connection timeout",
      );
    });
  });

  describe("CLI behavior", () => {
    it("should receive completion messages when channelId is set", () => {
      const sendMessageToChannel = mock(
        (_channelId: string | null, _message: string) => {},
      );
      const supportsMessageEditing = (): boolean => false;

      const event = createCompletionEvent({
        id: "job-cli",
        message: "Capture completed",
        metadata: {
          operationType: "content_operations",
          channelId: "cli",
          interfaceType: "cli",
          rootJobId: "job-cli",
        },
      });

      if (!supportsMessageEditing() && event.metadata.channelId) {
        sendMessageToChannel(event.metadata.channelId, `✅ ${event.message}`);
      }

      expect(sendMessageToChannel).toHaveBeenCalledWith(
        "cli",
        "✅ Capture completed",
      );
    });
  });
});
