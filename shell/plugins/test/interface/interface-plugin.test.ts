import { describe, it, expect, beforeEach } from "bun:test";
import { InterfacePlugin } from "../../src/interface/interface-plugin";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import type { BaseJobTrackingInfo } from "../../src/interfaces";
import { z } from "@brains/utils";

// Empty config schema for minimal test plugins
const emptyConfigSchema = z.object({});

/**
 * Minimal test implementation - does NOT override handleProgressEvent
 * This tests that progress handler is optional
 */
class MinimalInterfacePlugin extends InterfacePlugin {
  constructor() {
    super(
      "minimal-interface",
      { name: "minimal-interface", version: "1.0.0" },
      {},
      emptyConfigSchema,
    );
  }

  // Expose protected methods for testing
  public testOwnsJob(jobId: string, rootJobId?: string): boolean {
    return this.ownsJob(jobId, rootJobId);
  }

  public testSetJobTracking(jobId: string, info: BaseJobTrackingInfo): void {
    this.setJobTracking(jobId, info);
  }

  public testGetJobTracking(
    jobId: string,
    rootJobId?: string,
  ): BaseJobTrackingInfo | undefined {
    return this.getJobTracking(jobId, rootJobId);
  }

  public testRemoveJobTracking(jobId: string): void {
    this.removeJobTracking(jobId);
  }

  public async testHandleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    await this.handleProgressEvent(event, context);
  }

  public getJobMessagesSize(): number {
    return this.jobMessages.size;
  }

  public setJobTrackingTtl(ttlMs: number): void {
    this.jobTrackingTtlMs = ttlMs;
  }
}

/**
 * Test implementation with custom progress handling
 */
class CustomProgressInterfacePlugin extends InterfacePlugin {
  public progressEvents: JobProgressEvent[] = [];

  constructor() {
    super(
      "custom-interface",
      { name: "custom-interface", version: "1.0.0" },
      {},
      emptyConfigSchema,
    );
  }

  protected override async handleProgressEvent(
    event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    this.progressEvents.push(event);
  }

  public async testHandleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    await this.handleProgressEvent(event, context);
  }
}

// Helper to create valid progress events
const createProgressEvent = (
  overrides: Partial<JobProgressEvent> = {},
): JobProgressEvent => ({
  id: "test-job",
  type: "job",
  status: "processing",
  metadata: {
    operationType: "content_operations",
    rootJobId: "test-job",
  },
  message: "Test progress",
  ...overrides,
});

// Helper to create valid job context
const createJobContext = (overrides: Partial<JobContext> = {}): JobContext => ({
  operationType: "content_operations",
  rootJobId: "test-job",
  ...overrides,
});

describe("InterfacePlugin", () => {
  describe("optional progress handler", () => {
    it("should instantiate without implementing handleProgressEvent", () => {
      // This tests that InterfacePlugin can be extended without
      // requiring handleProgressEvent to be implemented
      const plugin = new MinimalInterfacePlugin();
      expect(plugin).toBeDefined();
      expect(plugin.id).toBe("minimal-interface");
    });

    it("should have default no-op handleProgressEvent", async () => {
      const plugin = new MinimalInterfacePlugin();

      const event = createProgressEvent();
      const context = createJobContext();

      // Should not throw - default is a no-op
      const result = await plugin.testHandleProgressEvent(event, context);
      expect(result).toBeUndefined();
    });

    it("should allow overriding handleProgressEvent", async () => {
      const plugin = new CustomProgressInterfacePlugin();

      const event = createProgressEvent();
      const context = createJobContext();

      await plugin.testHandleProgressEvent(event, context);

      expect(plugin.progressEvents).toHaveLength(1);
      expect(plugin.progressEvents[0]).toEqual(event);
    });
  });

  describe("job tracking", () => {
    let plugin: MinimalInterfacePlugin;

    beforeEach(() => {
      plugin = new MinimalInterfacePlugin();
    });

    it("should track jobs with setJobTracking", () => {
      plugin.testSetJobTracking("job-1", { rootJobId: "job-1" });

      expect(plugin.testOwnsJob("job-1")).toBe(true);
      expect(plugin.testGetJobTracking("job-1")).toEqual({
        rootJobId: "job-1",
      });
    });

    it("should remove jobs with removeJobTracking", () => {
      plugin.testSetJobTracking("job-1", { rootJobId: "job-1" });
      expect(plugin.testOwnsJob("job-1")).toBe(true);

      plugin.testRemoveJobTracking("job-1");
      expect(plugin.testOwnsJob("job-1")).toBe(false);
    });

    it("should inherit ownership via rootJobId", () => {
      plugin.testSetJobTracking("root-job", { rootJobId: "root-job" });

      // Child job should be owned via rootJobId
      expect(plugin.testOwnsJob("child-job", "root-job")).toBe(true);
      expect(plugin.testGetJobTracking("child-job", "root-job")).toEqual({
        rootJobId: "root-job",
      });
    });

    it("should return undefined for unknown jobs", () => {
      expect(plugin.testOwnsJob("unknown-job")).toBe(false);
      expect(plugin.testGetJobTracking("unknown-job")).toBeUndefined();
    });
  });

  describe("job tracking cleanup", () => {
    let plugin: MinimalInterfacePlugin;

    beforeEach(() => {
      plugin = new MinimalInterfacePlugin();
    });

    it("should clean up old job tracking entries on remove", () => {
      // Add some tracking entries
      plugin.testSetJobTracking("job-1", { rootJobId: "job-1" });
      plugin.testSetJobTracking("job-2", { rootJobId: "job-2" });

      expect(plugin.getJobMessagesSize()).toBe(2);

      // After cleanup of completed jobs, they should be removed
      plugin.testRemoveJobTracking("job-1");

      expect(plugin.getJobMessagesSize()).toBe(1);
      expect(plugin.testOwnsJob("job-1")).toBe(false);
      expect(plugin.testOwnsJob("job-2")).toBe(true);
    });

    it("should not leak memory with many tracked jobs", () => {
      // Track 100 jobs
      for (let i = 0; i < 100; i++) {
        plugin.testSetJobTracking(`job-${i}`, { rootJobId: `job-${i}` });
      }

      expect(plugin.getJobMessagesSize()).toBe(100);

      // Remove half
      for (let i = 0; i < 50; i++) {
        plugin.testRemoveJobTracking(`job-${i}`);
      }

      expect(plugin.getJobMessagesSize()).toBe(50);
    });

    it("should automatically clean up entries older than TTL", () => {
      // Set a very short TTL for testing
      plugin.setJobTrackingTtl(100); // 100ms

      // Add tracking entry
      plugin.testSetJobTracking("old-job", { rootJobId: "old-job" });
      expect(plugin.getJobMessagesSize()).toBe(1);

      // Trigger cleanup (should happen on next setJobTracking)
      // Wait for TTL to expire, then add another job which triggers cleanup
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          plugin.testSetJobTracking("new-job", { rootJobId: "new-job" });

          // Old job should be cleaned up, new job should remain
          expect(plugin.testOwnsJob("old-job")).toBe(false);
          expect(plugin.testOwnsJob("new-job")).toBe(true);
          expect(plugin.getJobMessagesSize()).toBe(1);
          resolve();
        }, 150); // Wait longer than TTL
      });
    });

    it("should not clean up entries within TTL", () => {
      // Set a longer TTL for testing
      plugin.setJobTrackingTtl(10000); // 10 seconds

      // Add tracking entry
      plugin.testSetJobTracking("recent-job", { rootJobId: "recent-job" });
      expect(plugin.getJobMessagesSize()).toBe(1);

      // Trigger cleanup by adding another job
      plugin.testSetJobTracking("new-job", { rootJobId: "new-job" });

      // Both jobs should still exist (within TTL)
      expect(plugin.testOwnsJob("recent-job")).toBe(true);
      expect(plugin.testOwnsJob("new-job")).toBe(true);
      expect(plugin.getJobMessagesSize()).toBe(2);
    });
  });
});
