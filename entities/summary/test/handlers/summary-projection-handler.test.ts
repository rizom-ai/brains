import { describe, it, expect, spyOn } from "bun:test";
import type { Conversation, Message } from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { SummaryProjectionHandler } from "../../src/handlers/summary-projection-handler";
import { summaryConfigSchema } from "../../src/schemas/summary";

const conversations: Conversation[] = ["conv-1", "conv-2"].map((id) => ({
  id,
  sessionId: id,
  interfaceType: "cli",
  channelId: "cli-terminal",
  channelName: "CLI Terminal",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: "2026-01-01T00:01:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:01:00.000Z",
  metadata: {},
}));

function messagesFor(conversationId: string): Message[] {
  return [
    {
      id: `${conversationId}-m1`,
      conversationId,
      role: "user",
      content: "Please summarize this conversation.",
      timestamp: "2026-01-01T00:00:00.000Z",
      metadata: {},
    },
  ];
}

describe("SummaryProjectionHandler", () => {
  it("projects one conversation job", async () => {
    const context = createMockEntityPluginContext();
    spyOn(context.conversations, "get").mockResolvedValue(
      conversations[0] ?? null,
    );
    spyOn(context.conversations, "getMessages").mockResolvedValue(
      messagesFor("conv-1"),
    );
    spyOn(context.entityService, "getEntity").mockResolvedValue(null);
    spyOn(context.ai, "generate").mockResolvedValue({
      entries: [
        {
          title: "Single projection",
          summary: "The conversation was summarized.",
          startMessageIndex: 1,
          endMessageIndex: 1,
          keyPoints: [],
          decisions: [],
          actionItems: [],
        },
      ],
    });

    const handler = new SummaryProjectionHandler(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({}),
    );

    const result = await handler.process(
      { mode: "conversation", conversationId: "conv-1" },
      "job-1",
      createMockProgressReporter(),
    );

    expect(result.projected).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.results[0]?.conversationId).toBe("conv-1");
    expect(context.entityService.upsertEntity).toHaveBeenCalledTimes(1);
  });

  it("rebuilds all listed conversations", async () => {
    const context = createMockEntityPluginContext();
    spyOn(context.conversations, "list").mockResolvedValue(conversations);
    spyOn(context.conversations, "get").mockImplementation((conversationId) =>
      Promise.resolve(
        conversations.find(
          (conversation) => conversation.id === conversationId,
        ) ?? null,
      ),
    );
    spyOn(context.conversations, "getMessages").mockImplementation(
      (conversationId) => Promise.resolve(messagesFor(conversationId)),
    );
    spyOn(context.entityService, "getEntity").mockResolvedValue(null);
    spyOn(context.ai, "generate").mockResolvedValue({
      entries: [
        {
          title: "Rebuild projection",
          summary: "The conversation was summarized during rebuild.",
          startMessageIndex: 1,
          endMessageIndex: 1,
          keyPoints: [],
          decisions: [],
          actionItems: [],
        },
      ],
    });

    const handler = new SummaryProjectionHandler(
      context,
      createSilentLogger(),
      summaryConfigSchema.parse({}),
    );

    const result = await handler.process(
      { mode: "rebuild-all", reason: "test" },
      "job-1",
      createMockProgressReporter(),
    );

    expect(result.projected).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.results.map((item) => item.conversationId)).toEqual([
      "conv-1",
      "conv-2",
    ]);
    expect(context.entityService.upsertEntity).toHaveBeenCalledTimes(2);
  });
});
