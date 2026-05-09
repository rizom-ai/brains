import { describe, it, expect, spyOn } from "bun:test";
import type { Conversation, Message } from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import { SummaryProjector } from "../../src/lib/summary-projector";
import { SummaryAdapter } from "../../src/adapters/summary-adapter";
import { summaryConfigSchema } from "../../src/schemas/summary";
import type { SummaryEntry } from "../../src/schemas/summary";
import { createMockSummaryEntity } from "../fixtures/summary-entities";

const conversation: Conversation = {
  id: "conv-1",
  sessionId: "conv-1",
  interfaceType: "cli",
  channelId: "cli-terminal",
  channelName: "CLI Terminal",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: "2026-01-01T00:01:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:01:00.000Z",
  metadata: {},
};

const messages: Message[] = [
  {
    id: "m1",
    conversationId: "conv-1",
    role: "user",
    content: "Use stored messages as source of truth.",
    timestamp: "2026-01-01T00:00:00.000Z",
    metadata: {},
  },
  {
    id: "m2",
    conversationId: "conv-1",
    role: "assistant",
    content: "I will project summaries from conversations.",
    timestamp: "2026-01-01T00:01:00.000Z",
    metadata: {},
  },
];

function mockDecisionAndExtraction(
  context: ReturnType<typeof createMockEntityPluginContext>,
  decision: "skip" | "update" | "append" = "update",
): void {
  spyOn(context.ai, "generate").mockImplementation(
    <T>({ prompt }: { prompt: string }) => {
      if (String(prompt).startsWith("Decide how to project")) {
        return Promise.resolve({ decision, rationale: "test" } as T);
      }

      return Promise.resolve({
        entries: [
          {
            title: "Projection source",
            summary: "Summaries derive from stored conversation messages.",
            startMessageIndex: 1,
            endMessageIndex: 2,
            keyPoints: ["Stored messages are source of truth"],
            decisions: [],
            actionItems: [],
          },
        ],
      } as T);
    },
  );
}

function makeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `chunk-m${index + 1}`,
    conversationId: "conv-1",
    role: index % 2 === 0 ? "user" : "assistant",
    content: `Message ${index + 1}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    metadata: {},
  }));
}

describe("SummaryProjector", () => {
  it("projects a conversation summary from stored messages", async () => {
    const context = createMockEntityPluginContext({
      spaces: ["cli:cli-terminal"],
    });
    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(messages);
    spyOn(context.entityService, "getEntity").mockResolvedValue(null);
    const upsertSpy = spyOn(context.entityService, "upsertEntity");
    mockDecisionAndExtraction(context);

    const projector = new SummaryProjector(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({}),
    );

    const result = await projector.projectConversation("conv-1");

    expect(result.skipped).toBe(false);
    expect(result.entryCount).toBe(1);
    expect(result.messageCount).toBe(2);
    expect(upsertSpy).toHaveBeenCalledTimes(1);

    const entity = upsertSpy.mock.calls[0]?.[0]?.entity;
    expect(entity?.id).toBe("conv-1");
    expect(entity?.metadata["conversationId"]).toBe("conv-1");
    expect(entity?.metadata["messageCount"]).toBe(2);
    expect(entity?.content).toContain("# Conversation Summary");
    expect(entity?.content).toContain("Projection source");
  });

  it("chunks long conversations before extraction", async () => {
    const context = createMockEntityPluginContext({
      spaces: ["cli:cli-terminal"],
    });
    const longMessages = makeMessages(5);
    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(longMessages);
    spyOn(context.entityService, "getEntity").mockResolvedValue(null);
    const generateSpy = spyOn(context.ai, "generate").mockImplementation(
      <T>({ prompt }: { prompt: string }) => {
        if (String(prompt).startsWith("Decide how to project")) {
          return Promise.resolve({
            decision: "update",
            rationale: "test",
          } as T);
        }

        return Promise.resolve({
          entries: [
            {
              title: "Chunk",
              summary: String(prompt).includes("Message 5")
                ? "Final chunk"
                : "Earlier chunk",
              startMessageIndex: 1,
              endMessageIndex: String(prompt).includes("Message 5") ? 1 : 2,
              keyPoints: [],
              decisions: [],
              actionItems: [],
            },
          ],
        } as T);
      },
    );

    const projector = new SummaryProjector(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({ maxMessagesPerChunk: 2 }),
    );

    const result = await projector.projectConversation("conv-1");

    expect(result.entryCount).toBe(3);
    expect(generateSpy).toHaveBeenCalledTimes(4);
  });

  it("compacts entries when chunk output exceeds maxEntries", async () => {
    const context = createMockEntityPluginContext({
      spaces: ["cli:cli-terminal"],
    });
    const longMessages = makeMessages(5);
    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(longMessages);
    spyOn(context.entityService, "getEntity").mockResolvedValue(null);
    const upsertSpy = spyOn(context.entityService, "upsertEntity");
    spyOn(context.ai, "generate").mockImplementation(
      <T>({ prompt }: { prompt: string }) => {
        if (String(prompt).startsWith("Decide how to project")) {
          return Promise.resolve({
            decision: "update",
            rationale: "test",
          } as T);
        }

        return Promise.resolve({
          entries: [
            {
              title: "Chunk",
              summary: "Chunk summary",
              startMessageIndex: 1,
              endMessageIndex: 1,
              keyPoints: [],
              decisions: [],
              actionItems: [],
            },
          ],
        } as T);
      },
    );

    const projector = new SummaryProjector(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({ maxMessagesPerChunk: 1, maxEntries: 2 }),
    );

    const result = await projector.projectConversation("conv-1");

    expect(result.entryCount).toBe(2);
    expect(upsertSpy.mock.calls[0]?.[0]?.entity.content).toContain(
      "Chunk summary",
    );
  });

  it("skips projection outside configured spaces", async () => {
    const context = createMockEntityPluginContext({ spaces: ["discord:ops"] });
    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(messages);
    const upsertSpy = spyOn(context.entityService, "upsertEntity");
    const generateSpy = spyOn(context.ai, "generate");

    const projector = new SummaryProjector(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({}),
    );

    const result = await projector.projectConversation("conv-1");

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("space-not-configured");
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("skips projection when AI decides there is no durable memory", async () => {
    const context = createMockEntityPluginContext({
      spaces: ["cli:cli-terminal"],
    });
    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(messages);
    spyOn(context.entityService, "getEntity").mockResolvedValue(null);
    const upsertSpy = spyOn(context.entityService, "upsertEntity");
    mockDecisionAndExtraction(context, "skip");

    const projector = new SummaryProjector(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({}),
    );

    const result = await projector.projectConversation("conv-1");

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("ai-skip");
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(context.ai.generate).toHaveBeenCalledTimes(1);
  });

  it("appends new entries when AI decides the summary can be extended", async () => {
    const context = createMockEntityPluginContext({
      spaces: ["cli:cli-terminal"],
    });
    const allMessages = [
      ...messages,
      {
        id: "m3",
        conversationId: "conv-1",
        role: "user" as const,
        content: "Decision: use a 90 second delayed projection window.",
        timestamp: "2026-01-01T00:02:00.000Z",
        metadata: {},
      },
    ];
    const existingEntry: SummaryEntry = {
      title: "Projection source",
      summary: "Summaries derive from stored conversation messages.",
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceMessageCount: 2,
      keyPoints: ["Stored messages are source of truth"],
      decisions: [],
      actionItems: [],
    };
    const adapter = new SummaryAdapter();
    const existing = createMockSummaryEntity({
      content: adapter.composeContent([existingEntry], {
        conversationId: "conv-1",
        channelId: "cli-terminal",
        channelName: "CLI Terminal",
        interfaceType: "cli",
        messageCount: 2,
        entryCount: 1,
        sourceHash: "old-hash",
        projectionVersion: 1,
        timeRange: existingEntry.timeRange,
      }),
      metadata: {
        conversationId: "conv-1",
        channelId: "cli-terminal",
        channelName: "CLI Terminal",
        interfaceType: "cli",
        messageCount: 2,
        entryCount: 1,
        sourceHash: "old-hash",
        projectionVersion: 1,
        timeRange: existingEntry.timeRange,
      },
    });

    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(allMessages);
    spyOn(context.entityService, "getEntity").mockResolvedValue(existing);
    const upsertSpy = spyOn(context.entityService, "upsertEntity");
    spyOn(context.ai, "generate").mockImplementation(
      <T>({ prompt }: { prompt: string }) => {
        if (String(prompt).startsWith("Decide how to project")) {
          expect(String(prompt)).toContain("90 second delayed projection");
          expect(String(prompt)).not.toContain("Use stored messages");
          return Promise.resolve({
            decision: "append",
            rationale: "new decision",
          } as T);
        }

        expect(String(prompt)).toContain("90 second delayed projection");
        expect(String(prompt)).not.toContain("Use stored messages");
        return Promise.resolve({
          entries: [
            {
              title: "Projection delay",
              summary: "The team chose a 90 second delayed projection window.",
              startMessageIndex: 1,
              endMessageIndex: 1,
              keyPoints: [],
              decisions: ["Use a 90 second delayed projection window"],
              actionItems: [],
            },
          ],
        } as T);
      },
    );

    const projector = new SummaryProjector(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({}),
    );

    const result = await projector.projectConversation("conv-1");

    expect(result.skipped).toBe(false);
    expect(result.entryCount).toBe(2);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const entity = upsertSpy.mock.calls[0]?.[0]?.entity;
    expect(entity?.content).toContain("Projection source");
    expect(entity?.content).toContain("Projection delay");
    expect(entity?.metadata["messageCount"]).toBe(3);
  });

  it("skips projection when source hash is unchanged", async () => {
    const context = createMockEntityPluginContext({
      spaces: ["cli:cli-terminal"],
    });
    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(messages);

    const projector = new SummaryProjector(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({}),
    );
    const source = await projector["sourceReader"].readConversation("conv-1");

    spyOn(context.entityService, "getEntity").mockResolvedValue(
      createMockSummaryEntity({
        content: "# Conversation Summary\n",
        metadata: {
          conversationId: "conv-1",
          channelId: "cli-terminal",
          channelName: "CLI Terminal",
          interfaceType: "cli",
          messageCount: 2,
          entryCount: 1,
          sourceHash: source.sourceHash,
          projectionVersion: 1,
          timeRange: {
            start: "2026-01-01T00:00:00.000Z",
            end: "2026-01-01T00:01:00.000Z",
          },
        },
      }),
    );
    const upsertSpy = spyOn(context.entityService, "upsertEntity");
    const generateSpy = spyOn(context.ai, "generate");

    const result = await projector.projectConversation("conv-1");

    expect(result.skipped).toBe(true);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(generateSpy).not.toHaveBeenCalled();
  });
});
