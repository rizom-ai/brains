import { describe, expect, it } from "bun:test";
import {
  formatMessageProgressAmount,
  formatMessageProgressDisplay,
  formatMessageProgressLabel,
  getMessageProgressTitle,
} from "../../src/message-interface/progress-display";
import type { JobProgressEvent } from "@brains/job-queue";

function progressEvent(
  overrides: Partial<JobProgressEvent> = {},
): JobProgressEvent {
  return {
    id: "job-1",
    type: "job",
    status: "processing",
    metadata: {
      operationType: "content_operations",
      operationTarget: "site",
      rootJobId: "job-1",
    },
    ...overrides,
  };
}

describe("progress display helpers", () => {
  it("formats operation labels", () => {
    expect(formatMessageProgressLabel(progressEvent())).toBe(
      "content operations: site",
    );
  });

  it("formats progress amount", () => {
    expect(
      formatMessageProgressAmount(
        progressEvent({
          progress: { current: 2, total: 4, percentage: 50 },
        }),
      ),
    ).toBe("2/4 (50%)");
  });

  it("omits invalid progress amount", () => {
    expect(
      formatMessageProgressAmount(
        progressEvent({
          progress: { current: 0, total: 0, percentage: 0 },
        }),
      ),
    ).toBeUndefined();
  });

  it("maps status titles", () => {
    expect(getMessageProgressTitle("pending")).toBe("Job queued");
    expect(getMessageProgressTitle("processing")).toBe("Job processing");
    expect(getMessageProgressTitle("completed")).toBe("Job completed");
    expect(getMessageProgressTitle("failed")).toBe("Job failed");
  });

  it("builds display payload with fallback", () => {
    expect(
      formatMessageProgressDisplay(
        progressEvent({
          progress: { current: 2, total: 4, percentage: 50 },
          message: "Publishing pages",
        }),
      ),
    ).toEqual({
      title: "Job processing",
      label: "content operations: site",
      amount: "2/4 (50%)",
      message: "Publishing pages",
      fallback:
        "Job processing: content operations: site 2/4 (50%)\nPublishing pages",
    });
  });
});
