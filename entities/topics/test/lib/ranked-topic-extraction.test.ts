import { describe, expect, it, mock } from "bun:test";
import {
  createTestEntity,
  createMockEntityService,
} from "@brains/entity-service/test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type {
  BaseEntity,
  EntityPluginContext,
  IRuntimeStateStore,
  ContentGenerationConfig,
} from "@brains/plugins";
import {
  createRankedTopicJobHandler,
  type TopicExtractionResult,
} from "../../src/lib/ranked-topic-extraction";
import { topicVoteSchema, type TopicVote } from "../../src/schemas/votes";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "../../src/schemas/config";
import { TopicAdapter } from "../../src/lib/topic-adapter";

type AIGenerationSchema<T> = z.ZodType<T>;

interface Fixture {
  entities: Map<string, BaseEntity>;
  service: EntityPluginContext["entityService"];
  context: EntityPluginContext;
  config: TopicsPluginConfig;
  store: IRuntimeStateStore<TopicVote>;
  sourceListLimits: (number | undefined)[];
  calls: {
    prompt: string;
    signal: AbortSignal | undefined;
    templateName: string;
  }[];
  run(id?: string, signal?: AbortSignal): Promise<TopicExtractionResult>;
  addTopic(title: string, id?: string): BaseEntity;
}

function fixture(
  count: number,
  options: {
    config?: z.input<typeof topicsPluginConfigSchema>;
    propose?: boolean;
  } = {},
): Fixture {
  const entities = new Map<string, BaseEntity>();
  for (let i = 0; i < count; i++) {
    const source = createTestEntity("note", {
      id: `note-${String(i).padStart(3, "0")}`,
      content: `source ${i}`,
      contentHash: `hash-${i}`,
      visibility: "public",
    });
    entities.set(`note:${source.id}`, source);
  }
  const service = createMockEntityService({
    entityTypes: ["note", "topic"],
    listEntitiesImpl: async ({ entityType }) =>
      [...entities.values()].filter(
        (entity) => entity.entityType === entityType,
      ),
    getEntityImpl: async ({ entityType, id }) =>
      entities.get(`${entityType}:${id}`) ?? null,
  });
  const sourceListLimits: (number | undefined)[] = [];
  // Honours paging like the real store: id order, limit and offset.
  service.listEntities = mock(async ({ entityType, options }) => {
    if (entityType !== "topic") sourceListLimits.push(options?.limit);
    return [...entities.values()]
      .filter((entity) => entity.entityType === entityType)
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(
        options?.offset ?? 0,
        options?.limit === undefined
          ? undefined
          : (options.offset ?? 0) + options.limit,
      );
  });
  service.createEntity = mock(async ({ entity }) => {
    const saved = createTestEntity(entity.entityType, { ...entity });
    entities.set(`${saved.entityType}:${saved.id}`, saved);
    return { entityId: saved.id, jobId: "embedding", skipped: false };
  });
  service.deleteEntity = mock(async ({ entityType, id }) =>
    entities.delete(`${entityType}:${id}`),
  );
  const base = createMockEntityPluginContext({ entityService: service });
  const calls: {
    prompt: string;
    signal: AbortSignal | undefined;
    templateName: string;
  }[] = [];
  const context: EntityPluginContext = {
    ...base,
    ai: {
      ...base.ai,
      generate: async (config, schema, signal) => {
        signal?.throwIfAborted();
        calls.push({
          prompt: config.prompt,
          signal,
          templateName: config.templateName,
        });
        if (config.templateName === "topics:description")
          return schema.parse({ content: "A durable knowledge domain." });
        const keys = [...config.prompt.matchAll(/Source key: ([^\n]+)/g)].map(
          (match) => match[1],
        );
        return schema.parse({
          sources: keys.map((sourceKey) => ({
            sourceKey,
            supported: [],
            proposal: options.propose
              ? {
                  title: "Architecture",
                  content: "Architecture evidence.",
                  relevanceScore: 0.95,
                }
              : null,
          })),
        });
      },
    },
  };
  const config = topicsPluginConfigSchema.parse(options.config ?? {});
  const store = context.runtimeState.scoped({
    namespace: "topics.votes",
    schema: topicVoteSchema,
  });
  const run = (
    id = "job",
    signal = new AbortController().signal,
  ): Promise<TopicExtractionResult> =>
    createRankedTopicJobHandler(context, config, createSilentLogger()).process(
      {},
      id,
      createMockProgressReporter(),
      signal,
    );
  const addTopic = (title: string, id = title.toLowerCase()): BaseEntity => {
    const topic = createTestEntity("topic", {
      id,
      visibility: "public",
      content: new TopicAdapter().createTopicBody({
        title,
        content: "Existing description.",
      }),
    });
    entities.set(`topic:${id}`, topic);
    return topic;
  };
  return {
    entities,
    service,
    context,
    config,
    store,
    sourceListLimits,
    calls,
    run,
    addTopic,
  };
}

describe("bounded ranked topic extraction", () => {
  it("checkpoints at most ten calls of four sources and resumes across handler instances", async () => {
    const f = fixture(45);
    const signal = new AbortController().signal;
    await f.run("first", signal);
    expect(f.calls).toHaveLength(10);
    expect(f.calls.every((call) => call.signal === signal)).toBe(true);
    expect(await f.store.list()).toHaveLength(40);
    expect(f.context.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "topics:extract",
        options: expect.objectContaining({
          deduplication: "skip",
          deduplicationKey: "topics:extract",
        }),
      }),
    );
    await f.run("resumed");
    expect(f.calls).toHaveLength(12);
    expect(await f.store.list()).toHaveLength(45);
    await f.run("unchanged");
    expect(f.calls).toHaveLength(12);
    const source = f.entities.get("note:note-003");
    if (!source) throw new Error("missing source");
    f.entities.set("note:note-003", {
      ...source,
      contentHash: "edited",
      content: "Edited source",
    });
    await f.run("edited");
    expect(f.calls).toHaveLength(13);
    expect(f.calls.at(-1)?.prompt).toContain("note:note-003");
    expect(f.calls.at(-1)?.prompt).not.toContain("note:note-004");
  });

  it("drops votes for deleted, private and newly ineligible sources", async () => {
    const f = fixture(3);
    await f.run();
    f.entities.delete("note:note-000");
    const privateSource = f.entities.get("note:note-001");
    const draft = f.entities.get("note:note-002");
    if (!privateSource || !draft) throw new Error("missing source");
    f.entities.set("note:note-001", {
      ...privateSource,
      visibility: "restricted",
    });
    f.entities.set("note:note-002", {
      ...draft,
      metadata: { status: "draft" },
    });
    await f.run();
    expect(await f.store.list()).toHaveLength(0);
    expect(f.calls).toHaveLength(1);
  });

  it("creates descriptions separately, preserves existing ids, and replaces the weakest topic", async () => {
    const f = fixture(1, { propose: true });
    const existing = f.addTopic("Strong", "legacy-strong-id");
    for (const title of ["Weak", "Other", "Another", "Last"]) f.addTopic(title);
    await f.run();
    expect(f.entities.get("topic:legacy-strong-id")).toEqual(existing);
    expect(f.entities.has("topic:architecture")).toBe(true);
    expect(
      [...f.entities.values()].filter(
        (entity) => entity.entityType === "topic",
      ),
    ).toHaveLength(5);
    expect(f.service.deleteEntity).toHaveBeenCalledTimes(1);
    expect(f.calls.map((call) => call.templateName)).toEqual([
      "topics:votes",
      "topics:description",
    ]);
  });

  it("does not reuse an occupied id when an existing topic was renamed", async () => {
    const f = fixture(1, { propose: true });
    const renamed = f.addTopic("Renamed", "architecture");
    for (const title of ["Other", "Another", "Last", "Weak"]) f.addTopic(title);
    await f.run();
    expect(f.entities.get("topic:architecture")).toEqual(renamed);
    expect(f.service.createEntity).not.toHaveBeenCalled();
    expect(f.service.deleteEntity).not.toHaveBeenCalled();
    await f.run("unchanged");
    expect(f.calls).toHaveLength(1);
  });

  it("bounds description generation too and continues selection in the next job", async () => {
    const f = fixture(40, { propose: true });
    await f.run();
    expect(f.calls).toHaveLength(10);
    expect(f.service.createEntity).not.toHaveBeenCalled();
    await f.run("selection");
    expect(f.calls).toHaveLength(11);
    expect(f.calls.at(-1)?.templateName).toBe("topics:description");
    expect(f.entities.has("topic:architecture")).toBe(true);
  });

  it("keeps completed batches on cancellation and does not write cancelled results", async () => {
    const f = fixture(8);
    const controller = new AbortController();
    const generate = f.context.ai.generate;
    let count = 0;
    f.context.ai.generate = async <T>(
      config: ContentGenerationConfig,
      schema: AIGenerationSchema<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      const output = await generate(config, schema, signal);
      if (++count === 2) controller.abort(new Error("deadline"));
      return output;
    };
    const error = await f
      .run("cancelled", controller.signal)
      .catch((error: unknown) => error);
    expect(error).toHaveProperty("message", "deadline");
    expect(await f.store.list()).toHaveLength(4);
    await f.run("retry");
    expect(await f.store.list()).toHaveLength(8);
    expect(f.calls).toHaveLength(3);
  });

  it("does not run overlapping jobs and recovers an abandoned lease", async () => {
    const f = fixture(1);
    const lock = f.context.runtimeState.scoped({
      namespace: "topics.extraction",
      schema: z.object({ owner: z.string(), expiresAt: z.number() }),
    });
    await lock.set("lease", {
      owner: "other-attempt",
      expiresAt: Date.now() + 60_000,
    });
    await f.run();
    expect(f.calls).toHaveLength(0);
    expect(f.context.jobs.enqueue).toHaveBeenCalled();
    await lock.set("lease", { owner: "dead-worker", expiresAt: 0 });
    await f.run("recovered");
    expect(f.calls).toHaveLength(1);
    expect(await lock.get("lease")).toBeNull();
  });

  it.each([false, true])(
    "does not checkpoint missing or duplicate per-source model results (duplicates=%s)",
    async (duplicates) => {
      const f = fixture(2);
      f.context.ai.generate = async <T>(
        _config: ContentGenerationConfig,
        schema: AIGenerationSchema<T>,
      ): Promise<T> =>
        schema.parse({
          sources: duplicates
            ? Array.from({ length: 2 }, () => ({
                sourceKey: "note:note-000",
                supported: [],
                proposal: null,
              }))
            : [],
        });
      const result = await f.run();
      expect(result.remaining).toBe(2);
      expect(await f.store.list()).toHaveLength(0);
      expect(f.context.jobs.enqueue).toHaveBeenCalled();
    },
  );

  it("drops an unlisted supported title instead of failing the batch", async () => {
    const f = fixture(2);
    f.addTopic("Architecture");
    f.context.ai.generate = async <T>(
      config: ContentGenerationConfig,
      schema: AIGenerationSchema<T>,
    ): Promise<T> =>
      schema.parse({
        sources: [...config.prompt.matchAll(/Source key: ([^\n]+)/g)].map(
          ([, sourceKey]) => ({
            sourceKey,
            supported: [
              { title: "Architecture", relevanceScore: 0.9 },
              { title: "architecture (systems)", relevanceScore: 0.9 },
            ],
            proposal: null,
          }),
        ),
      });
    await f.run();
    const votes = await f.store.list();
    expect(votes).toHaveLength(2);
    expect(
      votes.map(({ value }) => value.supported.map(({ slug }) => slug)),
    ).toEqual([["architecture"], ["architecture"]]);
  });

  it("isolates a failing source and abstains it after repeated failures", async () => {
    const f = fixture(5);
    const generate = f.context.ai.generate;
    f.context.ai.generate = async <T>(
      config: ContentGenerationConfig,
      schema: AIGenerationSchema<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      if (config.prompt.includes("note:note-002"))
        throw new Error("context window exceeded");
      return generate(config, schema, signal);
    };
    await f.run("first");
    expect((await f.store.list()).map(({ key }) => key)).toEqual([
      "note:note-004",
    ]);
    await f.run("isolated");
    expect((await f.store.list()).map(({ key }) => key).sort()).toEqual([
      "note:note-000",
      "note:note-001",
      "note:note-003",
      "note:note-004",
    ]);
    // Alone, the failing source proves nothing about the provider: no count.
    expect(
      await f.run("alone").catch((error: unknown) => error),
    ).toHaveProperty("message", "context window exceeded");
    expect(await f.store.get("note:note-002")).toBeNull();
    const edited = f.entities.get("note:note-004");
    if (!edited) throw new Error("missing source");
    f.entities.set("note:note-004", { ...edited, contentHash: "edited" });
    await f.run("abstained");
    expect(await f.store.get("note:note-002")).toEqual({
      contentHash: "hash-2",
      visibility: "public",
      supported: [],
      proposal: null,
    });
    const calls = f.calls.length;
    await f.run("settled");
    expect(f.calls).toHaveLength(calls);
  });

  it("fails a job whose every call fails without recording source failures", async () => {
    const f = fixture(8);
    f.context.ai.generate = async (): Promise<never> => {
      throw new Error("provider unavailable");
    };
    expect(await f.run().catch((error: unknown) => error)).toHaveProperty(
      "message",
      "provider unavailable",
    );
    const failures = f.context.runtimeState.scoped({
      namespace: "topics.failures",
      schema: z.unknown(),
    });
    expect(await failures.list()).toHaveLength(0);
    expect(await f.store.list()).toHaveLength(0);
  });

  it("does not count a cancelled call as a source failure", async () => {
    const f = fixture(4);
    const controller = new AbortController();
    f.context.ai.generate = async (): Promise<never> => {
      controller.abort(new Error("deadline"));
      throw new Error("aborted");
    };
    const error = await f
      .run("cancelled", controller.signal)
      .catch((error: unknown) => error);
    expect(error).toHaveProperty("message", "deadline");
    const failures = f.context.runtimeState.scoped({
      namespace: "topics.failures",
      schema: z.unknown(),
    });
    expect(await failures.list()).toHaveLength(0);
  });

  it("defers replacing topics until every source has a current vote", async () => {
    const f = fixture(45, { propose: true });
    for (const title of [
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
    ])
      f.addTopic(title);
    await f.run("first");
    await f.run("second");
    // The second job extracts the last five sources before replacing anything.
    expect(f.calls.slice(10).map(({ templateName }) => templateName)).toEqual([
      "topics:votes",
      "topics:votes",
      "topics:description",
    ]);
    expect(f.service.deleteEntity).toHaveBeenCalledTimes(1);
  });

  it("reads sources in pages and loads full content only for prompted sources", async () => {
    const f = fixture(45);
    await f.run();
    expect(f.sourceListLimits.length).toBeGreaterThan(0);
    expect(f.sourceListLimits.every((limit) => limit !== undefined)).toBe(true);
    expect(f.service.getEntity).toHaveBeenCalledTimes(40);
  });

  it("does not publish evidence that became private during description generation", async () => {
    const f = fixture(1, { propose: true });
    const generate = f.context.ai.generate;
    f.context.ai.generate = async <T>(
      config: ContentGenerationConfig,
      schema: AIGenerationSchema<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      const result = await generate(config, schema, signal);
      if (config.templateName === "topics:description") {
        const source = f.entities.get("note:note-000");
        if (!source) throw new Error("missing source");
        f.entities.set("note:note-000", {
          ...source,
          visibility: "restricted",
        });
      }
      return result;
    };
    await f.run();
    expect(f.service.createEntity).not.toHaveBeenCalled();
    expect(await f.store.list()).toHaveLength(0);
  });

  it("rescans changes made during extraction and leaves edited sources stale", async () => {
    const f = fixture(1);
    const generate = f.context.ai.generate;
    f.context.ai.generate = async <T>(
      config: ContentGenerationConfig,
      schema: AIGenerationSchema<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      const result = await generate(config, schema, signal);
      const source = f.entities.get("note:note-000");
      if (!source) throw new Error("missing source");
      f.entities.set("note:note-000", {
        ...source,
        contentHash: "concurrent-edit",
      });
      return result;
    };
    const result = await f.run();
    expect(result.remaining).toBe(1);
    expect((await f.store.get("note:note-000"))?.contentHash).toBe("hash-0");
    expect(f.context.jobs.enqueue).toHaveBeenCalled();
  });

  it("never mints from a non-mintable role", async () => {
    const f = fixture(2, {
      propose: true,
      config: { sourceRoleOverrides: { note: "supporting" } },
    });
    await f.run();
    expect(f.service.createEntity).not.toHaveBeenCalled();
    expect(
      (await f.store.list()).every(({ value }) => value.proposal === null),
    ).toBe(true);
  });
});
