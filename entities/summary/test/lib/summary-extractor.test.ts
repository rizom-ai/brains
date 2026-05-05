import { describe, it, expect, spyOn } from "bun:test";
import { SummaryExtractor } from "../../src/lib/summary-extractor";
import { summaryConfigSchema } from "../../src/schemas/summary";
import {
  createMockShell,
  createEntityPluginContext,
} from "@brains/plugins/test";
import type { Message } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";

const messages: Message[] = [
  {
    id: "m1",
    conversationId: "conv-1",
    role: "user",
    content: "Use timestamps, not message ranges.",
    timestamp: "2026-01-01T00:00:00.000Z",
    metadata: {},
  },
  {
    id: "m2",
    conversationId: "conv-1",
    role: "assistant",
    content: "Agreed, entries will use timeRange.",
    timestamp: "2026-01-01T00:01:00.000Z",
    metadata: {},
  },
];

describe("SummaryExtractor", () => {
  it("maps AI message indexes to code-owned time ranges", async () => {
    const logger = createSilentLogger();
    const context = createEntityPluginContext(
      createMockShell({ logger }),
      "summary",
    );
    spyOn(context.ai, "generate").mockResolvedValue({
      entries: [
        {
          title: "Schema decision",
          summary: "The summary schema should use time ranges.",
          startMessageIndex: 1,
          endMessageIndex: 2,
          keyPoints: ["Message indexes are implementation-specific"],
          decisions: ["Use timeRange"],
          actionItems: [],
        },
      ],
    });

    const extractor = new SummaryExtractor(
      context,
      logger,
      summaryConfigSchema.parse({}),
    );

    const entries = await extractor.extract(messages);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.timeRange).toEqual({
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-01T00:01:00.000Z",
    });
    expect(entries[0]?.sourceMessageCount).toBe(2);
  });

  it("honors config flags for optional sections", async () => {
    const logger = createSilentLogger();
    const context = createEntityPluginContext(
      createMockShell({ logger }),
      "summary",
    );
    spyOn(context.ai, "generate").mockResolvedValue({
      entries: [
        {
          title: "Action item",
          summary: "The user requested evals.",
          startMessageIndex: 1,
          endMessageIndex: 2,
          keyPoints: ["Evals are needed"],
          decisions: ["Add evals"],
          actionItems: ["Create eval cases"],
        },
      ],
    });

    const extractor = new SummaryExtractor(
      context,
      logger,
      summaryConfigSchema.parse({
        includeKeyPoints: false,
        includeDecisions: false,
        includeActionItems: false,
      }),
    );

    const entries = await extractor.extract(messages);

    expect(entries[0]?.keyPoints).toEqual([]);
    expect(entries[0]?.decisions).toEqual([]);
    expect(entries[0]?.actionItems).toEqual([]);
  });
});
