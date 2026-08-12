import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  ProjectionExecutionContext,
  ProjectionInputContext,
  ProjectionJsonObject,
} from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
import { createSocialPostProjectionRule } from "../src/lib/social-post-projection";

function entity(input: {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
}): BaseEntity {
  return {
    ...input,
    contentHash: `${input.id}-hash`,
    visibility: "public",
    created: "2025-01-01T00:00:00.000Z",
    updated: "2025-01-01T00:00:00.000Z",
  };
}

function inputContext(entities: BaseEntity[]): ProjectionInputContext {
  const service = createMockEntityService({
    entityTypes: ["post", "social-post", "style-guide"],
    getEntityImpl: async ({ entityType, id }) =>
      entities.find(
        (candidate) =>
          candidate.entityType === entityType && candidate.id === id,
      ) ?? null,
    listEntitiesImpl: async ({ entityType }) =>
      entities.filter((candidate) => candidate.entityType === entityType),
  });
  return {
    entities: service,
    resolvePrompt: async () => "resolved LinkedIn prompt",
    appInfo: async () => ({
      model: "test-brain",
      version: "1.0.0",
      uptime: 0,
      entities: entities.length,
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
      ai: { model: "test-model", embeddingModel: "test-embedding" },
      daemons: [],
      endpoints: [],
      interactions: [],
    }),
    identityInput: (): ProjectionJsonObject => ({ id: "brain" }),
  };
}

function executionContext(generated: { title: string; content: string }): {
  context: ProjectionExecutionContext;
  generate: ProjectionExecutionContext["ai"]["generate"];
} {
  const pluginContext = createMockEntityPluginContext({
    returns: { ai: { generate: generated } },
  });
  return {
    context: {
      ai: pluginContext.ai,
      logger: createSilentLogger("social-post-projection-test"),
    },
    generate: pluginContext.ai.generate,
  };
}

const queuedPost = entity({
  id: "post-1",
  entityType: "post",
  content: "Queued source body",
  metadata: {
    title: "Queued source",
    slug: "queued-source",
    status: "queued",
  },
});

const draftPost = entity({
  id: "post-2",
  entityType: "post",
  content: "Draft source body",
  metadata: {
    title: "Draft source",
    slug: "draft-source",
    status: "draft",
  },
});

const existingSocialPost = entity({
  id: "linkedin-post-1",
  entityType: "social-post",
  content: `---\ntitle: Existing post\nplatform: linkedin\nstatus: draft\nsourceEntityType: post\nsourceEntityId: post-1\n---\nExisting body`,
  metadata: {
    title: "Existing post",
    slug: "linkedin-existing-post",
    platform: "linkedin",
    status: "draft",
  },
});

describe("social post projection rule", () => {
  it("selects queued posts and records existing source-derived outputs", async () => {
    const rule = createSocialPostProjectionRule();

    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([queuedPost, draftPost, existingSocialPost]),
      new AbortController().signal,
    );

    expect(selected).toMatchObject({
      sources: [{ id: "post-1", title: "Queued source" }],
      existingSourceIds: ["post-1"],
      templatePrompt: "resolved LinkedIn prompt",
      model: "test-model",
      identity: { id: "brain" },
    });
  });

  it("derives one stable social post for each missing queued source", async () => {
    const rule = createSocialPostProjectionRule();
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([queuedPost, draftPost]),
      new AbortController().signal,
    );
    const execution = executionContext({
      title: "A generated title",
      content: "Generated social body",
    });

    const intents = await rule.derive(
      selected,
      execution.context,
      new AbortController().signal,
    );

    expect(execution.generate).toHaveBeenCalledTimes(1);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      operation: "upsert",
      entity: {
        id: "linkedin-post-1",
        entityType: "social-post",
        metadata: {
          title: "A generated title",
          platform: "linkedin",
          status: "draft",
        },
        visibility: "public",
      },
    });
    expect(
      intents[0]?.operation === "upsert" ? intents[0].entity.content : "",
    ).toContain("sourceEntityId: post-1");
  });

  it("does not call the model when every queued source already has an output", async () => {
    const rule = createSocialPostProjectionRule();
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([queuedPost, existingSocialPost]),
      new AbortController().signal,
    );
    const execution = executionContext({
      title: "Unexpected",
      content: "Unexpected",
    });

    const intents = await rule.derive(
      selected,
      execution.context,
      new AbortController().signal,
    );

    expect(execution.generate).not.toHaveBeenCalled();
    expect(intents).toEqual([]);
  });
});
