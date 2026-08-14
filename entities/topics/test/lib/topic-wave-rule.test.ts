import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  ProjectionExecutionContext,
  ProjectionInputContext,
} from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
import { TopicAdapter } from "../../src/lib/topic-adapter";
import { createTopicProjectionRule } from "../../src/lib/topic-wave-rule";
import { topicsPluginConfigSchema } from "../../src/schemas/config";

const now = "2026-04-30T00:00:00.000Z";

function entity(input: {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
}): BaseEntity {
  return {
    ...input,
    contentHash: `hash:${input.id}`,
    visibility: "public",
    created: now,
    updated: now,
  };
}

function inputContext(entities: BaseEntity[]): ProjectionInputContext {
  const service = createMockEntityService({
    entityTypes: ["post", "topic"],
    listEntitiesImpl: async ({ entityType }) =>
      entities.filter((candidate) => candidate.entityType === entityType),
  });
  return {
    entities: {
      getEntity: service.getEntity,
      listEntities: service.listEntities,
      getEntityTypes: service.getEntityTypes,
      hasEntityType: service.hasEntityType,
      getEntityTypeConfig: () => ({ projectionSourceRole: "primary" }),
    },
    resolvePrompt: async (_reference, fallback) => fallback,
    appInfo: async () => ({
      version: "0.0.0",
      model: "test-model",
      uptime: 0,
      entities: 0,
      entityCounts: [],
      embeddings: 0,
      backgroundWork: {
        status: "operational",
        reasons: [],
        worker: {
          state: "active",
          activeSessions: 1,
          staleSessions: 0,
          latestHeartbeatAgeMs: 0,
        },
        queue: {
          duePending: 0,
          processing: 0,
          oldestDuePendingAgeMs: null,
          latestClaimAgeMs: null,
          stalled: false,
        },
      },
      ai: { model: "test-model", embeddingModel: "test-embedding-model" },
      daemons: [],
      endpoints: [],
      interactions: [],
    }),
    identityInput: () => ({}),
  };
}

function executionContext(): {
  context: ProjectionExecutionContext;
  generate: ProjectionExecutionContext["ai"]["generate"];
} {
  const pluginContext = createMockEntityPluginContext({
    returns: {
      ai: {
        generate: {
          topics: [
            {
              title: "Backpressure",
              content: "Bound work admitted during bursts.",
              relevanceScore: 0.95,
            },
          ],
        },
      },
    },
  });
  return {
    context: {
      ai: pluginContext.ai,
      logger: createSilentLogger("topic-wave-rule-test"),
    },
    generate: pluginContext.ai.generate,
  };
}

describe("topic wave rule", () => {
  it("selects eligible sources once and returns canonical topic writes", async () => {
    const config = topicsPluginConfigSchema.parse({
      includeEntityTypes: ["post"],
      autoMerge: false,
    });
    const rule = createTopicProjectionRule(config);
    expect(rule.sourceChangeBatchDelayMs).toBe(1000);
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([
        entity({
          id: "post-1",
          entityType: "post",
          content: "Queues should admit bounded work.",
          metadata: { title: "Queue design", status: "published" },
        }),
        entity({
          id: "draft",
          entityType: "post",
          content: "Do not inspect this.",
          metadata: { title: "Draft", status: "draft" },
        }),
      ]),
      signal,
    );
    const { context, generate } = executionContext();

    const intents = await rule.derive(selected, context, signal);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(intents).toEqual([
      {
        operation: "upsert",
        entity: {
          id: "backpressure",
          entityType: "topic",
          content: new TopicAdapter().createTopicBody({
            title: "Backpressure",
            content: "Bound work admitted during bursts.",
          }),
          metadata: {},
          visibility: "public",
        },
      },
    ]);
  });

  it("does not call the model when no eligible sources exist", async () => {
    const config = topicsPluginConfigSchema.parse({
      includeEntityTypes: ["post"],
    });
    const rule = createTopicProjectionRule(config);
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([]),
      signal,
    );
    const { context, generate } = executionContext();

    expect(await rule.derive(selected, context, signal)).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
