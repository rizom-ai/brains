import { describe, it, expect, spyOn } from "bun:test";
import { SummaryExtractor } from "../../src/lib/summary-extractor";
import { buildSummaryExtractionPrompt } from "../../src/lib/summary-prompt";
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

describe("buildSummaryExtractionPrompt", () => {
  it("treats system messages as constraints instead of decisions", () => {
    const prompt = buildSummaryExtractionPrompt({
      messages,
      config: summaryConfigSchema.parse({}),
    });

    expect(prompt).toContain("system/developer messages as constraints");
    expect(prompt).toContain("Preserve relevant system/developer constraints");
    expect(prompt).toContain("not as user decisions or action items");
  });

  it("formats messages with speaker attribution when actor metadata is present", () => {
    const prompt = buildSummaryExtractionPrompt({
      messages: [
        {
          id: "m1",
          conversationId: "conv-1",
          role: "user",
          content: "I decided we should keep the onboarding doc short.",
          timestamp: "2026-01-01T00:00:00.000Z",
          metadata: {
            actor: {
              actorId: "discord:user-123",
              interfaceType: "discord",
              role: "user",
              displayName: "Mira Ops",
              username: "mira",
            },
          },
        },
        {
          id: "m2",
          conversationId: "conv-1",
          role: "user",
          content: "I'll update the checklist by Friday.",
          timestamp: "2026-01-01T00:01:00.000Z",
          metadata: {
            actor: {
              actorId: "discord:user-456",
              interfaceType: "discord",
              role: "user",
              displayName: "Daniel",
              username: "daniel",
            },
          },
        },
      ],
      config: summaryConfigSchema.parse({}),
    });

    expect(prompt).toContain("Mira Ops [user]: I decided");
    expect(prompt).toContain("Daniel [user]: I'll update");
    expect(prompt).toContain("distinct task, artifact, or decision area");
    expect(prompt).toContain("preserve those speaker names");
    expect(prompt).toContain("Mira decided");
    expect(prompt).toContain("Daniel will");
    expect(prompt).toContain("explicit user requests, instructions");
    expect(prompt).toContain("Alice owns the adapter rewrite");
    expect(prompt).toContain("do not infer owners from proximity alone");
    expect(prompt).not.toContain("user: I decided");
  });
});

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

    const memory = await extractor.extract(messages);

    expect(memory.entries).toHaveLength(1);
    expect(memory.entries[0]?.timeRange).toEqual({
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-01T00:01:00.000Z",
    });
    expect(memory.entries[0]?.sourceMessageCount).toBe(2);
    expect(memory.decisions[0]).toEqual({
      text: "Use timeRange",
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceMessageCount: 2,
    });
  });

  it("preserves system constraints as key points, not decisions", async () => {
    const logger = createSilentLogger();
    const context = createEntityPluginContext(
      createMockShell({ logger }),
      "summary",
    );
    spyOn(context.ai, "generate").mockResolvedValue({
      entries: [
        {
          title: "Package rebuild",
          summary: "The user requested healthier abstractions.",
          startMessageIndex: 2,
          endMessageIndex: 3,
          keyPoints: ["The rebuild should use healthy abstractions."],
          decisions: [],
          actionItems: [],
        },
      ],
    });

    const extractor = new SummaryExtractor(
      context,
      logger,
      summaryConfigSchema.parse({}),
    );

    const memory = await extractor.extract([
      {
        id: "m0",
        conversationId: "conv-1",
        role: "system",
        content:
          "Constraint: do not preserve backward compatibility for the summary schema.",
        timestamp: "2026-01-01T00:00:00.000Z",
        metadata: {},
      },
      ...messages,
    ]);

    expect(memory.entries[0]?.keyPoints).toContain(
      "Constraint: do not preserve backward compatibility for the summary schema.",
    );
    expect(memory.decisions.map((item) => item.text).join("\n")).not.toContain(
      "backward compatibility",
    );
    expect(memory.entries[0]?.timeRange.start).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps decisions and action items separate from summary entries", async () => {
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
      }),
    );

    const memory = await extractor.extract(messages);

    expect(memory.entries[0]?.keyPoints).toEqual([]);
    expect(memory.decisions.map((item) => item.text)).toEqual(["Add evals"]);
    expect(memory.actionItems.map((item) => item.text)).toEqual([
      "Create eval cases",
    ]);
  });

  it("drops malformed decision and action item strings from model output", async () => {
    const logger = createSilentLogger();
    const context = createEntityPluginContext(
      createMockShell({ logger }),
      "summary",
    );
    spyOn(context.ai, "generate").mockResolvedValue({
      entries: [
        {
          title: "Malformed items",
          summary: "The model emitted punctuation-only memory items.",
          startMessageIndex: 1,
          endMessageIndex: 2,
          keyPoints: [],
          decisions: [":"],
          actionItems: [
            ":",
            "Continue from the prior context, though no specific task was stated.",
            "Create eval cases",
          ],
        },
      ],
    });

    const extractor = new SummaryExtractor(
      context,
      logger,
      summaryConfigSchema.parse({}),
    );

    const memory = await extractor.extract(messages);

    expect(memory.decisions).toEqual([]);
    expect(memory.actionItems.map((item) => item.text)).toEqual([
      "Create eval cases",
    ]);
  });
});
