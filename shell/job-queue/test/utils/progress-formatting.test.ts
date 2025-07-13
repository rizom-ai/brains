import { describe, test, expect } from "bun:test";
import {
  generateProgressKey,
  createProgressMessageData,
  formatProgressMessage,
  formatBatchProgressMessage,
  getStatusEmoji,
} from "../../src/utils/progress-formatting";
import type { JobProgressEvent } from "../../src/job-progress-monitor";

const mockJobEvent: JobProgressEvent = {
  id: "job-1",
  type: "job",
  status: "processing",
  progress: {
    current: 50,
    total: 100,
    percentage: 50,
  },
  metadata: {
    userId: "user-1",
    interfaceId: "test",
    operationType: "file_processing",
  },
};

const mockBatchEvent: JobProgressEvent = {
  id: "batch-1",
  type: "batch",
  status: "processing",
  batchDetails: {
    completedOperations: 3,
    totalOperations: 10,
    failedOperations: 0,
  },
  metadata: {
    userId: "user-1",
    interfaceId: "test",
    operationType: "batch_processing",
  },
};

describe("generateProgressKey", () => {
  test("generates unique key for event and target", () => {
    const key = generateProgressKey(mockJobEvent, "room-123");
    expect(key).toBe("job:job-1:room-123");
  });

  test("generates different keys for different targets", () => {
    const key1 = generateProgressKey(mockJobEvent, "room-123");
    const key2 = generateProgressKey(mockJobEvent, "room-456");
    expect(key1).not.toBe(key2);
  });
});

describe("createProgressMessageData", () => {
  test("creates data for processing job with progress", () => {
    const startTime = new Date(Date.now() - 10000); // 10s ago
    const data = createProgressMessageData(mockJobEvent, startTime);

    expect(data.operationType).toBe("file_processing");
    expect(data.status).toBe("processing");
    expect(data.current).toBe(50);
    expect(data.total).toBe(100);
    expect(data.percentage).toBe(50);
    expect(data.calculation).toBeDefined();
    expect(data.duration).toBeUndefined(); // Not completed yet
  });

  test("creates data for completed job with duration", () => {
    const completedEvent = { ...mockJobEvent, status: "completed" as const };
    const startTime = new Date(Date.now() - 5000); // 5s ago
    const data = createProgressMessageData(completedEvent, startTime);

    expect(data.status).toBe("completed");
    expect(data.duration).toBeCloseTo(5, 1);
  });

  test("creates data for failed job with error", () => {
    const failedEvent = {
      ...mockJobEvent,
      status: "failed" as const,
      message: "File not found",
    };
    const data = createProgressMessageData(failedEvent);

    expect(data.status).toBe("failed");
    expect(data.error).toBe("File not found");
  });

  test("handles job without progress info", () => {
    const eventWithoutProgress = {
      ...mockJobEvent,
      progress: undefined,
    };
    const data = createProgressMessageData(eventWithoutProgress);

    expect(data.current).toBeUndefined();
    expect(data.total).toBeUndefined();
    expect(data.percentage).toBeUndefined();
    expect(data.calculation).toBeUndefined();
  });
});

describe("formatProgressMessage", () => {
  test("formats processing message with progress", () => {
    const data = {
      operationType: "file_processing" as const,
      status: "processing" as const,
      current: 50,
      total: 100,
      percentage: 50,
      calculation: {
        rate: 2.5,
        eta: "20s",
        etaSeconds: 20,
      },
    };

    const message = formatProgressMessage(data);
    expect(message).toBe("🔄 file_processing - 50/100 (50%) • 2.5/s • ETA 20s");
  });

  test("formats processing message without progress", () => {
    const data = {
      operationType: "entity_processing" as const,
      status: "processing" as const,
    };

    const message = formatProgressMessage(data);
    expect(message).toBe("🔄 entity_processing");
  });

  test("formats completed message with stats", () => {
    const data = {
      operationType: "file_processing" as const,
      status: "completed" as const,
      current: 100,
      total: 100,
      duration: 45,
    };

    const message = formatProgressMessage(data);
    expect(message).toBe(
      "✅ file_processing completed - 100 items processed in 45s",
    );
  });

  test("formats failed message with error", () => {
    const data = {
      operationType: "file_processing" as const,
      status: "failed" as const,
      current: 50,
      total: 100,
      error: "Permission denied",
    };

    const message = formatProgressMessage(data);
    expect(message).toBe(
      "❌ file_processing failed - 50/100 items processed - Permission denied",
    );
  });

  test("formats unknown status", () => {
    const data = {
      operationType: "entity_processing" as const,
      status: "processing" as const,
    };

    const message = formatProgressMessage(data);
    expect(message).toBe("🔄 entity_processing");
  });
});

describe("formatBatchProgressMessage", () => {
  test("formats batch processing message", () => {
    const startTime = new Date(Date.now() - 15000); // 15s ago
    const message = formatBatchProgressMessage(mockBatchEvent, startTime);

    expect(message).toContain("🔄 batch_processing - 3/10 operations");
    expect(message).toContain("ETA");
  });

  test("formats completed batch message", () => {
    const completedBatch = {
      ...mockBatchEvent,
      status: "completed" as const,
      batchDetails: {
        completedOperations: 10,
        totalOperations: 10,
        failedOperations: 0,
      },
    };
    const startTime = new Date(Date.now() - 30000); // 30s ago
    const message = formatBatchProgressMessage(completedBatch, startTime);

    expect(message).toContain(
      "✅ batch_processing completed - 10 operations processed",
    );
    expect(message).toContain("30s");
  });

  test("formats failed batch message", () => {
    const failedBatch = {
      ...mockBatchEvent,
      status: "failed" as const,
      batchDetails: {
        completedOperations: 7,
        totalOperations: 10,
        failedOperations: 3,
      },
    };
    const message = formatBatchProgressMessage(failedBatch);

    expect(message).toBe(
      "❌ batch_processing failed - 7/10 operations completed",
    );
  });

  test("falls back to regular formatting for non-batch events", () => {
    const message = formatBatchProgressMessage(mockJobEvent);
    expect(message).toContain("🔄 file_processing");
  });

  test("handles batch without start time", () => {
    const message = formatBatchProgressMessage(mockBatchEvent);
    expect(message).toBe("🔄 batch_processing - 3/10 operations");
  });
});

describe("getStatusEmoji", () => {
  test("returns correct emojis for statuses", () => {
    expect(getStatusEmoji("processing")).toBe("🔄");
    expect(getStatusEmoji("completed")).toBe("✅");
    expect(getStatusEmoji("failed")).toBe("❌");
    expect(getStatusEmoji("pending")).toBe("⏳");
  });

  test("returns default emoji for unknown status", () => {
    expect(getStatusEmoji("unknown" as never)).toBe("⚙️");
  });
});
