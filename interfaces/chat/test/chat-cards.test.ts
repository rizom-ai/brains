import { describe, it, expect } from "bun:test";
import type { JobProgressEvent } from "@brains/plugins";
import { buildProgressCard } from "../src/chat-cards";

function progressEvent(
  overrides: Partial<JobProgressEvent> = {},
): JobProgressEvent {
  return {
    id: "job-1",
    type: "job",
    status: "processing",
    message: undefined,
    metadata: {
      operationType: "content_operations",
      rootJobId: "job-root",
      operationTarget: "Site",
      interfaceType: "discord",
    },
    ...overrides,
  };
}

describe("buildProgressCard", () => {
  it("renders the title, label, and fallback from a progress event", () => {
    const { card, fallbackText } = buildProgressCard(progressEvent());

    expect(card.type).toBe("card");
    expect(card.title).toBe("Job processing");
    expect(card.children).toEqual([
      { type: "text", content: "content operations: Site" },
    ]);
    expect(fallbackText).toBe("Job processing: content operations: Site");
  });

  it("includes the amount line and message when present", () => {
    const { card, fallbackText } = buildProgressCard(
      progressEvent({
        status: "failed",
        message: "Build failed: missing template",
        progress: { current: 2, total: 4, percentage: 50 },
      }),
    );

    expect(card.title).toBe("Job failed");
    expect(card.children).toEqual([
      { type: "text", content: "content operations: Site" },
      { type: "text", content: "2/4 (50%)" },
      { type: "text", content: "Build failed: missing template" },
    ]);
    expect(fallbackText).toContain(
      "Job failed: content operations: Site 2/4 (50%)",
    );
    expect(fallbackText).toContain("Build failed: missing template");
  });
});
