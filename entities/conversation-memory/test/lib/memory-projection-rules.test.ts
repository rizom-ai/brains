import { describe, expect, it } from "bun:test";
import {
  PROJECTION_ABSTAINED,
  type BaseEntity,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
} from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
import {
  appendMemoryProjectionEnvelope,
  parseMemoryProjectionEnvelope,
} from "../../src/lib/memory-projection-envelope";
import {
  createActionItemProjectionRule,
  createDecisionProjectionRule,
} from "../../src/lib/memory-projection-rules";
import { parseSummaryBody } from "../../src/lib/summary-body";
import { summaryConfigSchema } from "../../src/schemas/summary-config";

const now = "2026-01-01T00:00:00.000Z";
const config = summaryConfigSchema.parse({ memoryVisibility: "shared" });
const executionContext: ProjectionExecutionContext = {
  ai: createMockEntityPluginContext().ai,
  logger: createSilentLogger("memory-rules"),
};

const projectedDecision = {
  id: "conversation-1:decision:stable",
  entityType: "decision",
  content: "---\nstatus: active\n---\n# Decision\n\nShip Thursday.\n",
  metadata: {
    conversationId: "conversation-1",
    channelId: "team",
    interfaceType: "mcp",
    spaceId: "mcp:team",
    timeRange: { start: now, end: now },
    sourceSummaryId: "conversation-1",
    sourceMessageCount: 1,
    projectionVersion: 1,
    status: "active",
  },
  visibility: "shared" as const,
};

function summary(content: string): BaseEntity {
  return {
    id: "conversation-1",
    entityType: "summary",
    content,
    contentHash: "summary-hash",
    visibility: "shared",
    created: now,
    updated: now,
    metadata: {
      conversationId: "conversation-1",
      channelId: "team",
      interfaceType: "mcp",
      messageCount: 1,
      entryCount: 1,
      sourceHash: "source-hash",
      projectionVersion: 1,
    },
  };
}

function context(options: {
  summary: BaseEntity;
  existing?: BaseEntity[];
  reads?: unknown[];
}): ProjectionInputContext {
  return {
    spaces: ["mcp:team"],
    entities: createMockEntityService({
      entityTypes: ["summary", "decision", "action-item"],
      getEntityImpl: async () => options.summary,
      listEntitiesImpl: async (request) => {
        options.reads?.push(request);
        return options.existing ?? [];
      },
    }),
    conversations: {
      get: async () => null,
      getMessages: async () => [],
    },
    resolvePrompt: async (_reference, fallback) => fallback,
    appInfo: async () =>
      ({ ai: { model: "test" } }) as Awaited<
        ReturnType<ProjectionInputContext["appInfo"]>
      >,
    identityInput: () => ({}),
  };
}

const trigger = {
  waveId: "wave-1",
  inputs: [
    {
      sourceType: "summary",
      sourceId: "conversation-1",
      revision: "summary-hash",
      operation: "upsert" as const,
    },
  ],
};

describe("conversation memory projection envelope", () => {
  it("round-trips machine data without changing the narrative body", () => {
    const narrative =
      "# Conversation Summary\n\n## Release\n\nTime: 2026-01-01T00:00:00.000Z → 2026-01-01T00:00:00.000Z  \nMessages summarized: 1\n\nThe team will ship Thursday.\n";
    const content = appendMemoryProjectionEnvelope(narrative, {
      version: 1,
      decisions: [projectedDecision],
      actionItems: [],
    });

    expect(content).not.toContain("### Decisions");
    expect(parseMemoryProjectionEnvelope(content)?.decisions).toEqual([
      projectedDecision,
    ]);
    expect(parseSummaryBody(content).entries[0]?.summary).toBe(
      "The team will ship Thursday.",
    );
  });
});

describe("managed summary memory rules", () => {
  it("reconciles only one summary partition and preserves lifecycle status", async () => {
    const content = appendMemoryProjectionEnvelope("# Conversation Summary\n", {
      version: 1,
      decisions: [projectedDecision],
      actionItems: [],
    });
    const existing: BaseEntity[] = [
      {
        ...projectedDecision,
        content: projectedDecision.content.replace("active", "superseded"),
        contentHash: "existing",
        created: now,
        updated: now,
        metadata: { ...projectedDecision.metadata, status: "superseded" },
      },
      {
        ...projectedDecision,
        id: "conversation-1:decision:stale",
        contentHash: "stale",
        created: now,
        updated: now,
      },
      {
        ...projectedDecision,
        id: "conversation-1:decision:other-visibility",
        visibility: "restricted",
        contentHash: "other-visibility",
        created: now,
        updated: now,
      },
      {
        ...projectedDecision,
        id: "conversation-2:decision:other",
        contentHash: "other-conversation",
        created: now,
        updated: now,
        metadata: {
          ...projectedDecision.metadata,
          conversationId: "conversation-2",
          sourceSummaryId: "conversation-2",
        },
      },
    ];
    const reads: unknown[] = [];
    const rule = createDecisionProjectionRule(config);
    const selected = await rule.selectInput(
      trigger,
      context({ summary: summary(content), existing, reads }),
      new AbortController().signal,
    );
    const intents = await rule.derive(
      selected,
      executionContext,
      new AbortController().signal,
    );

    expect(reads).toEqual([
      {
        entityType: "decision",
        options: {
          filter: {
            metadata: { sourceSummaryId: "conversation-1" },
            visibilityScope: "shared",
          },
        },
      },
    ]);
    expect(intents).toHaveLength(2);
    expect(intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "upsert",
          entity: expect.objectContaining({
            id: projectedDecision.id,
            metadata: expect.objectContaining({ status: "superseded" }),
          }),
        }),
        {
          operation: "delete",
          entityType: "decision",
          id: "conversation-1:decision:stale",
        },
      ]),
    );
  });

  it("deletes the old partition when a valid replacement has zero items", async () => {
    const content = appendMemoryProjectionEnvelope("# Conversation Summary\n", {
      version: 1,
      decisions: [],
      actionItems: [],
    });
    const existing: BaseEntity = {
      ...projectedDecision,
      contentHash: "existing",
      created: now,
      updated: now,
    };
    const rule = createDecisionProjectionRule(config);
    const selected = await rule.selectInput(
      trigger,
      context({ summary: summary(content), existing: [existing] }),
      new AbortController().signal,
    );

    expect(
      await rule.derive(
        selected,
        executionContext,
        new AbortController().signal,
      ),
    ).toEqual([
      {
        operation: "delete",
        entityType: "decision",
        id: projectedDecision.id,
      },
    ]);
  });

  it("abstains on a legacy summary instead of deleting old memory", async () => {
    const rule = createActionItemProjectionRule(config);
    const selected = await rule.selectInput(
      trigger,
      context({ summary: summary("# Legacy summary\n") }),
      new AbortController().signal,
    );

    expect(
      await rule.derive(
        selected,
        executionContext,
        new AbortController().signal,
      ),
    ).toBe(PROJECTION_ABSTAINED);
  });
});
