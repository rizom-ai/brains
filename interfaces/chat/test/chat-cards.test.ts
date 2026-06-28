import { describe, it, expect } from "bun:test";
import type { JobProgressEvent } from "@brains/plugins";
import { buildProgressCard } from "../src/chat-cards";

function progressEvent(
  overrides: Partial<JobProgressEvent> = {},
): JobProgressEvent {
  return {
    status: "processing",
    message: undefined,
    metadata: {
      operationType: "content_generation",
      operationTarget: "Site",
      interfaceType: "discord",
    },
    ...overrides,
  } as JobProgressEvent;
}

describe("buildProgressCard", () => {
  it("renders the title, label, and fallback from a progress event", () => {
    const { card, fallbackText } = buildProgressCard(progressEvent());

    expect(card.type).toBe("card");
    expect(card.title).toBe("Job processing");
    expect(card.children).toEqual([
      { type: "text", content: "content generation: Site" },
    ]);
    expect(fallbackText).toBe("Job processing: content generation: Site");
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
      { type: "text", content: "content generation: Site" },
      { type: "text", content: "2/4 (50%)" },
      { type: "text", content: "Build failed: missing template" },
    ]);
    expect(fallbackText).toContain(
      "Job failed: content generation: Site 2/4 (50%)",
    );
    expect(fallbackText).toContain("Build failed: missing template");
  });
});
