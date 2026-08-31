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
import { z } from "@brains/utils/zod";
import { createTopicBody } from "../../src/lib/topic-body";
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
    spaces: [],
    conversations: {
      get: async () => null,
      getMessages: async () => [],
      getManyWithMessages: async () => [],
    },
    entities: {
      getEntity: service.getEntity,
      getEntities: service.getEntities,
      listEntities: service.listEntities,
      getEntityTypes: () => ["post", "note", "topic"],
      hasEntityType: service.hasEntityType,
      getEntityTypeConfig: () => ({ projectionSourceRole: "primary" }),
      isProjectionOwnedEntity: service.isProjectionOwnedEntity,
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
    const rule = createTopicProjectionRule(config, "topics:extraction");
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
          content: createTopicBody({
            title: "Backpressure",
            content: "Bound work admitted during bursts.",
          }),
          metadata: {},
          visibility: "public",
        },
      },
    ]);
  });

  // These properties were asserted against predicate methods on the plugin
  // that nothing but the tests called; the rule's own source selection is
  // where include/exclude and publishable status actually decide anything.
  it("selects only source types the config admits", async () => {
    const config = topicsPluginConfigSchema.parse({
      includeEntityTypes: ["post", "note"],
      excludeEntityTypes: ["note"],
    });
    const signal = new AbortController().signal;
    const selected = await createTopicProjectionRule(
      config,
      "topics:extraction",
    ).selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([
        entity({
          id: "post-1",
          entityType: "post",
          content: "Admitted.",
          metadata: { title: "Post" },
        }),
        entity({
          id: "note-1",
          entityType: "note",
          content: "Excluded by config.",
          metadata: { title: "Note" },
        }),
        entity({
          id: "topic-1",
          entityType: "topic",
          content: createTopicBody({ title: "Existing", content: "Body." }),
          metadata: {},
        }),
      ]),
      signal,
    );

    // A topic never sources itself, whatever the include list says.
    expect(
      z
        .object({ sources: z.array(z.object({ id: z.string() })) })
        .parse(selected)
        .sources.map(({ id }) => id),
    ).toEqual(["post-1"]);
  });

  it("skips sources whose status is not publishable, and keeps those with no status", async () => {
    const config = topicsPluginConfigSchema.parse({
      includeEntityTypes: ["post"],
      extractableStatuses: ["published"],
    });
    const signal = new AbortController().signal;
    const selected = await createTopicProjectionRule(
      config,
      "topics:extraction",
    ).selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([
        entity({
          id: "published",
          entityType: "post",
          content: "Live.",
          metadata: { title: "Live", status: "published" },
        }),
        entity({
          id: "draft",
          entityType: "post",
          content: "Not yet.",
          metadata: { title: "Draft", status: "draft" },
        }),
        entity({
          id: "statusless",
          entityType: "post",
          content: "No status at all.",
          metadata: { title: "Plain" },
        }),
      ]),
      signal,
    );

    expect(
      z
        .object({ sources: z.array(z.object({ id: z.string() })) })
        .parse(selected)
        .sources.map(({ id }) => id),
    ).toEqual(["published", "statusless"]);
  });

  it("does not call the model when no eligible sources exist", async () => {
    const config = topicsPluginConfigSchema.parse({
      includeEntityTypes: ["post"],
    });
    const rule = createTopicProjectionRule(config, "topics:extraction");
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
