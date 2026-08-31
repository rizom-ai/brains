import { describe, expect, it } from "bun:test";
import { PROJECTION_ABSTAINED } from "@brains/plugins";
import type {
  Conversation,
  Message,
  ProjectionExecutionContext,
  ProjectionInputContext,
} from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
import { createSummaryProjectionRule } from "../../src/lib/summary-rule";
import { summaryConfigSchema } from "../../src/schemas/summary-config";

const config = summaryConfigSchema.parse({});
const spaces = ["mcp:team"];

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
    sessionId: "conversation-1",
    interfaceType: "mcp",
    channelId: "team",
    channelName: "Team",
    startedAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-01-01T00:01:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    metadata: {},
    ...overrides,
  };
}

function messages(conversationId: string): Message[] {
  return [
    {
      id: `${conversationId}-m1`,
      conversationId,
      role: "user",
      content: "We decided to ship the projection runtime on Thursday.",
      timestamp: "2026-01-01T00:00:00.000Z",
      metadata: {},
    },
  ];
}

function inputContext(options: {
  conversations: Conversation[];
  reads?: string[];
  conversationBatchReads?: string[][];
  entityBatchReads?: string[][];
  forbidSingularReads?: boolean;
}): ProjectionInputContext {
  const entities = Object.assign(
    createMockEntityService({ entityTypes: ["summary"] }),
    {
      getEntity: async () => {
        if (options.forbidSingularReads) {
          throw new Error("singular entity read used");
        }
        return null;
      },
      getEntities: async (request: { ids: readonly string[] }) => {
        options.entityBatchReads?.push([...request.ids]);
        return [];
      },
    },
  );
  const conversations = {
    get: async (id: string): Promise<Conversation | null> => {
      if (options.forbidSingularReads) {
        throw new Error("singular conversation read used");
      }
      return options.conversations.find((entry) => entry.id === id) ?? null;
    },
    getMessages: async (id: string): Promise<Message[]> => {
      if (options.forbidSingularReads) {
        throw new Error("singular message read used");
      }
      options.reads?.push(id);
      return messages(id);
    },
    getManyWithMessages: async (request: {
      ids: readonly string[];
      messageLimit: number;
    }): Promise<Array<{ conversation: Conversation; messages: Message[] }>> => {
      const ids = [...request.ids];
      options.conversationBatchReads?.push(ids);
      options.reads?.push(...ids);
      return ids.flatMap((id) => {
        const found = options.conversations.find((entry) => entry.id === id);
        return found ? [{ conversation: found, messages: messages(id) }] : [];
      });
    },
  };
  return {
    entities,
    spaces,
    conversations,
    resolvePrompt: async (_reference, fallback): Promise<string> => fallback,
    appInfo: async () =>
      ({ ai: { model: "test-model" } }) as Awaited<
        ReturnType<ProjectionInputContext["appInfo"]>
      >,
    identityInput: () => ({}),
  };
}

function executionContext(entries: unknown[]): ProjectionExecutionContext {
  const plugin = createMockEntityPluginContext({
    returns: { ai: { generate: { entries, decisions: [], actionItems: [] } } },
  });
  return {
    ai: {
      ...plugin.ai,
      generateObject: async <T>() =>
        ({
          object: { decision: "update", rationale: "test" } as T,
        }) as { object: T },
    },
    logger: createSilentLogger("summary-rule-test"),
  };
}

const trigger = (
  ids: string[],
): Parameters<
  ReturnType<typeof createSummaryProjectionRule>["selectInput"]
>[0] => ({
  waveId: "wave-1",
  inputs: ids.map((id) => ({
    sourceType: "conversation",
    sourceId: id,
    revision: "rev-1",
    operation: "upsert" as const,
  })),
});

describe("the summary derivation", () => {
  const signal = new AbortController().signal;

  it("summarizes the conversations the wave woke it about", async () => {
    const rule = createSummaryProjectionRule(config);
    const selected = await rule.selectInput(
      trigger(["conversation-1"]),
      inputContext({ conversations: [conversation()] }),
      signal,
    );

    const intents = await rule.derive(
      selected,
      executionContext([
        {
          title: "Release date",
          summary: "The projection runtime ships Thursday.",
          startMessageIndex: 1,
          endMessageIndex: 1,
          keyPoints: [],
          decisions: [],
          actionItems: [],
        },
      ]),
      signal,
    );
    if (!Array.isArray(intents)) {
      throw new Error("Expected the rule to derive rather than abstain");
    }

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      operation: "upsert",
      entity: {
        id: "conversation-1",
        entityType: "summary",
        visibility: config.memoryVisibility,
      },
    });
  });

  it("reads only the conversations it was woken about", async () => {
    // The cost that matters when several rules fan out in one wave: this one
    // must not walk the corpus because a single message arrived.
    const reads: string[] = [];
    const rule = createSummaryProjectionRule(config);
    await rule.selectInput(
      trigger(["conversation-1"]),
      inputContext({
        conversations: [
          conversation(),
          conversation({ id: "conversation-2", sessionId: "conversation-2" }),
          conversation({ id: "conversation-3", sessionId: "conversation-3" }),
        ],
        reads,
      }),
      signal,
    );

    expect(reads).toEqual(["conversation-1"]);
  });

  it("uses two batch reads for a 50-conversation wave", async () => {
    const conversations = Array.from({ length: 50 }, (_, index) => {
      const id = `conversation-${String(index + 1).padStart(2, "0")}`;
      return conversation({ id, sessionId: id });
    });
    const ids = conversations.map(({ id }) => id);
    const conversationBatchReads: string[][] = [];
    const entityBatchReads: string[][] = [];

    await createSummaryProjectionRule(config).selectInput(
      trigger(ids),
      inputContext({
        conversations,
        conversationBatchReads,
        entityBatchReads,
        forbidSingularReads: true,
      }),
      signal,
    );

    expect(conversationBatchReads).toEqual([ids]);
    expect(entityBatchReads).toEqual([ids]);
  });

  it("abstains when woken about a conversation outside its spaces", async () => {
    // Not "no summary should exist" — this rule simply has no view of a
    // channel it was never configured to remember.
    const rule = createSummaryProjectionRule(config);
    const selected = await rule.selectInput(
      trigger(["conversation-1"]),
      inputContext({
        conversations: [conversation({ channelId: "elsewhere" })],
      }),
      signal,
    );

    expect(await rule.derive(selected, executionContext([]), signal)).toBe(
      PROJECTION_ABSTAINED,
    );
  });

  it("adds rather than owns, so other conversations keep their summaries", () => {
    // A wave derives only what it was woken about, so "every summary this
    // run did not mention" would be every other conversation's.
    expect(createSummaryProjectionRule(config).targets).toEqual({
      authority: "additive",
    });
  });

  it("leaves a prior summary alone when nothing was worth remembering", async () => {
    const rule = createSummaryProjectionRule(config);
    const selected = await rule.selectInput(
      trigger(["conversation-1"]),
      inputContext({ conversations: [conversation()] }),
      signal,
    );

    expect(await rule.derive(selected, executionContext([]), signal)).toEqual(
      [],
    );
  });
});
