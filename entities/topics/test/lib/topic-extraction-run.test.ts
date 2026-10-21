import { describe, expect, it, mock } from "bun:test";
import {
  createTestEntity,
  createMockEntityService,
} from "@brains/entity-service/test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import {
  TopicExtractionRun,
  topicExtractionDeps,
  type TopicExtractionDeps,
} from "../../src/lib/topic-extraction-run";
import { topicsPluginConfigSchema } from "../../src/schemas/config";

/** Answers the votes prompt for the listed source keys only. */
type Answer = (sourceKeys: string[]) => {
  sourceKey: string;
  supported: [];
  proposal: { title: string; content: string; relevanceScore: number } | null;
}[];

function setup(
  count: number,
  answer: Answer,
): {
  entities: Map<string, BaseEntity>;
  context: EntityPluginContext;
  deps: TopicExtractionDeps;
} {
  const entities = new Map<string, BaseEntity>(
    Array.from({ length: count }, (_, index) => {
      const source = createTestEntity("note", {
        id: `note-${String(index).padStart(3, "0")}`,
        content: `source ${index}`,
        contentHash: `hash-${index}`,
        visibility: "public",
      });
      return [`note:${source.id}`, source] as const;
    }),
  );
  const service = createMockEntityService({
    entityTypes: ["note", "topic"],
    listEntitiesImpl: async ({ entityType }) =>
      [...entities.values()].filter(
        (entity) => entity.entityType === entityType,
      ),
    getEntityImpl: async ({ entityType, id }) =>
      entities.get(`${entityType}:${id}`) ?? null,
  });
  service.createEntity = mock(async ({ entity }) => {
    const saved = createTestEntity(entity.entityType, { ...entity });
    entities.set(`${saved.entityType}:${saved.id}`, saved);
    return { entityId: saved.id, jobId: "embedding", skipped: false };
  });
  const base = createMockEntityPluginContext({ entityService: service });
  const context: EntityPluginContext = {
    ...base,
    ai: {
      ...base.ai,
      generate: async (config, schema) =>
        schema.parse(
          config.templateName === "topics:description"
            ? { content: "A durable knowledge domain." }
            : {
                sources: answer(
                  [...config.prompt.matchAll(/Source key: ([^\n]+)/g)].map(
                    ([, key]) => key ?? "",
                  ),
                ),
              },
        ),
    },
  };
  const config = topicsPluginConfigSchema.parse({});
  return {
    entities,
    context,
    deps: topicExtractionDeps(context, config, createSilentLogger()),
  };
}

const abstain: Answer = (keys) =>
  keys.map((sourceKey) => ({ sourceKey, supported: [], proposal: null }));

describe("topic extraction run", () => {
  it("prunes stored votes and failures of sources that left the corpus on load", async () => {
    const { deps } = setup(2, abstain);
    const vote = {
      contentHash: "hash-gone",
      visibility: "public" as const,
      supported: [],
      proposal: null,
    };
    await deps.stores.votes.set("note:gone", vote);
    await deps.stores.votes.set("note:note-000", {
      ...vote,
      contentHash: "hash-0",
    });
    await deps.stores.failures.set("note:gone", {
      contentHash: "hash-gone",
      attempts: 1,
    });
    const run = await TopicExtractionRun.load(
      deps,
      new AbortController().signal,
    );
    expect((await deps.stores.votes.list()).map(({ key }) => key)).toEqual([
      "note:note-000",
    ]);
    expect(await deps.stores.failures.list()).toHaveLength(0);
    // A vote cast under no votes prompt is stale.
    expect(run.remaining()).toBe(2);
  });

  it("checkpoints attributable answers and counts an attempt for the rest", async () => {
    const { deps } = setup(2, (keys) =>
      abstain(keys.filter((key) => key === "note:note-000")),
    );
    const run = await TopicExtractionRun.load(
      deps,
      new AbortController().signal,
    );
    await run.vote();
    expect(run.calls).toBe(1);
    expect((await deps.stores.votes.list()).map(({ key }) => key)).toEqual([
      "note:note-000",
    ]);
    expect(await deps.stores.failures.get("note:note-001")).toEqual({
      contentHash: "hash-1",
      attempts: 1,
    });
    expect(run.remaining()).toBe(1);
  });

  it("fills a free slot from the leading challenger once votes are cast", async () => {
    const { entities, deps } = setup(1, (keys) =>
      keys.map((sourceKey) => ({
        sourceKey,
        supported: [],
        proposal: {
          title: "Architecture",
          content: "Architecture evidence.",
          relevanceScore: 0.95,
        },
      })),
    );
    const run = await TopicExtractionRun.load(
      deps,
      new AbortController().signal,
    );
    await run.select();
    expect(run.selectionPending()).toBe(false);
    await run.vote();
    expect(run.selectionPending()).toBe(true);
    await run.select();
    expect(entities.has("topic:architecture")).toBe(true);
    expect(run.calls).toBe(2);
    expect(run.changed).toBe(1);
    expect(run.selectionPending()).toBe(false);
  });
});
