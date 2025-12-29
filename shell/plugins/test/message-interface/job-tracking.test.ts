import { describe, expect, it, mock } from "bun:test";
import type { JobProgressEvent } from "@brains/job-queue";

/**
 * Tests for job tracking in message interfaces
 *
 * Job tracking allows interfaces to:
 * 1. Track which agent response messages contain async job IDs
 * 2. Edit those messages when jobs complete (if message editing is supported)
 * 3. Send completion messages for jobs that weren't tracked
 */

// Mock tracking state for testing
interface ProgressMessageTracking {
  messageId: string;
  channelId: string;
  lastUpdate: number;
}

// Tool result with required jobId (for type narrowing after filter)
interface ToolResultWithJob {
  toolName: string;
  jobId: string;
}

/**
 * Helper to extract jobIds from tool results
 * This is the logic that should be used by interfaces
 */
function extractJobIds(
  toolResults: Array<{ toolName: string; jobId?: string }> | undefined,
): string[] {
  if (!toolResults) return [];
  return toolResults
    .filter((tr): tr is ToolResultWithJob => tr.jobId !== undefined)
    .map((tr) => tr.jobId);
}

describe("job tracking", () => {
  describe("extractJobIds", () => {
    it("should extract jobIds from toolResults", () => {
      const toolResults = [
        { toolName: "capture_url", jobId: "job-123" },
        { toolName: "search_notes" },
        { toolName: "build_site", jobId: "job-456" },
      ];

      const jobIds = extractJobIds(toolResults);

      expect(jobIds).toEqual(["job-123", "job-456"]);
    });

    it("should return empty array when no toolResults", () => {
      const jobIds = extractJobIds(undefined);
      expect(jobIds).toEqual([]);
    });

    it("should return empty array when no jobs in toolResults", () => {
      const toolResults = [
        { toolName: "search_notes" },
        { toolName: "list_notes" },
      ];

      const jobIds = extractJobIds(toolResults);
      expect(jobIds).toEqual([]);
    });
  });

  describe("trackAgentResponseForJob", () => {
    it("should call trackAgentResponseForJob for each jobId", () => {
      const trackAgentResponseForJob = mock(
        (_jobId: string, _messageId: string, _channelId: string) => {
          // Track the call
        },
      );

      const messageId = "msg-001";
      const channelId = "room-123";
      const toolResults = [
        { toolName: "capture_url", jobId: "job-123" },
        { toolName: "build_site", jobId: "job-456" },
      ];

      const jobIds = extractJobIds(toolResults);
      for (const jobId of jobIds) {
        trackAgentResponseForJob(jobId, messageId, channelId);
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

      // Track initial message
      agentResponseTracking.set("job-123", {
        messageId: "msg-001",
        channelId: "room-123",
        lastUpdate: Date.now(),
      });

      // Simulate job completion event
      const completionEvent: JobProgressEvent = {
        id: "job-123",
        type: "job",
        status: "completed",
        message: "Capture completed successfully",
        progress: { current: 1, total: 1, percentage: 100 },
        metadata: {
          operationType: "content_operations",
          interfaceType: "matrix",
          channelId: "room-123",
          rootJobId: "job-123",
        },
      };

      // Handle completion
      const tracking = agentResponseTracking.get(completionEvent.id);
      if (tracking) {
        const completionMessage = `✅ ${completionEvent.message}`;
        await editMessage(
          tracking.channelId,
          tracking.messageId,
          completionMessage,
        );
        agentResponseTracking.delete(completionEvent.id);
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

      // No tracking for this job
      const completionEvent: JobProgressEvent = {
        id: "job-789",
        type: "job",
        status: "completed",
        message: "Build completed",
        progress: { current: 1, total: 1, percentage: 100 },
        metadata: {
          operationType: "content_operations",
          channelId: "room-123",
          rootJobId: "job-789",
        },
      };

      // Handle completion - no tracking, so send new message
      const tracking = agentResponseTracking.get(completionEvent.id);
      if (!tracking && completionEvent.metadata.channelId) {
        const completionMessage = `✅ ${completionEvent.message}`;
        sendMessageToChannel(
          completionEvent.metadata.channelId,
          completionMessage,
        );
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

      // Background job with no channelId
      const completionEvent: JobProgressEvent = {
        id: "job-background",
        type: "job",
        status: "completed",
        message: "Sync completed",
        progress: { current: 1, total: 1, percentage: 100 },
        metadata: {
          operationType: "file_operations",
          rootJobId: "job-background",
        },
      };

      // Handle completion - no tracking, no channelId, so no message
      const tracking = agentResponseTracking.get(completionEvent.id);
      if (!tracking && completionEvent.metadata.channelId) {
        sendMessageToChannel(completionEvent.metadata.channelId, "");
      }

      expect(sendMessageToChannel).not.toHaveBeenCalled();
    });

    it("should handle failed jobs", async () => {
      const agentResponseTracking = new Map<string, ProgressMessageTracking>();
      const editMessage = mock(
        async (_channelId: string, _messageId: string, _newMessage: string) =>
          true,
      );

      // Track initial message
      agentResponseTracking.set("job-fail", {
        messageId: "msg-002",
        channelId: "room-456",
        lastUpdate: Date.now(),
      });

      // Simulate job failure event
      const failureEvent: JobProgressEvent = {
        id: "job-fail",
        type: "job",
        status: "failed",
        message: "Failed to capture: Connection timeout",
        progress: { current: 0, total: 1, percentage: 0 },
        metadata: {
          operationType: "content_operations",
          channelId: "room-456",
          rootJobId: "job-fail",
        },
      };

      // Handle failure
      const tracking = agentResponseTracking.get(failureEvent.id);
      if (tracking) {
        const failureMessage = `❌ ${failureEvent.message}`;
        await editMessage(
          tracking.channelId,
          tracking.messageId,
          failureMessage,
        );
        agentResponseTracking.delete(failureEvent.id);
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
      // CLI doesn't support message editing, so it relies on sendMessageToChannel
      const sendMessageToChannel = mock(
        (_channelId: string | null, _message: string) => {},
      );
      const supportsMessageEditing = (): boolean => false;

      const completionEvent: JobProgressEvent = {
        id: "job-cli",
        type: "job",
        status: "completed",
        message: "Capture completed",
        progress: { current: 1, total: 1, percentage: 100 },
        metadata: {
          operationType: "content_operations",
          channelId: "cli",
          interfaceType: "cli",
          rootJobId: "job-cli",
        },
      };

      // CLI behavior: no editing support, so always send new message
      if (!supportsMessageEditing() && completionEvent.metadata.channelId) {
        const completionMessage = `✅ ${completionEvent.message}`;
        sendMessageToChannel(
          completionEvent.metadata.channelId,
          completionMessage,
        );
      }

      expect(sendMessageToChannel).toHaveBeenCalledWith(
        "cli",
        "✅ Capture completed",
      );
    });
  });
});
