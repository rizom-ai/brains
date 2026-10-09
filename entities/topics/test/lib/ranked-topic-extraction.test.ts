import { describe, expect, it, mock } from "bun:test";
import { SdkError } from "@brains/sdk/services";
import {
  createTestEntity,
  createMockEntityService,
} from "@brains/entity-service/test";
import {
  createMockEntityPluginContext,
  createTestEntityAccess,
} from "@brains/plugins/test";
import { createSilentLogger, caughtError } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type {
  BaseEntity,
  EntityPluginContext,
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
  ContentGenerationConfig,
} from "@brains/plugins";
import {
  createTopicCheckpoints,
  runRankedTopicExtraction,
  sourceRevision,
  type TopicExtractionResult,
} from "../../src/lib/ranked-topic-extraction";
import { topicVoteSchema, type TopicVote } from "../../src/schemas/votes";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "../../src/schemas/config";
import { createTopicBody } from "../../src/lib/topic-body";

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
    _id = "job",
    signal = new AbortController().signal,
  ): Promise<TopicExtractionResult> =>
    runRankedTopicExtraction(
      {
        ai: context.ai,
        logger: createSilentLogger(),
        signal,
        entities: createTestEntityAccess({ entityService: service }),
        template: (name) => `topics:${name}`,
        createTopic: async ({ title, content, ...input }) => {
          await service.createEntity({
            entity: {
              ...input,
              entityType: "topic",
              metadata: {},
              content: createTopicBody({ title, content }),
            },
          });
        },
        readTopics: async () =>
          [...entities.values()]
            .filter((entry) => entry.entityType === "topic")
            .map((entity) => ({
              entity: structuredClone(entity),
              version: sourceRevision(entity),
            })),
        deleteTopic: async (id, revision) => {
          const current = entities.get(`topic:${id}`);
          if (!current || sourceRevision(current) !== revision)
            throw new SdkError("conflict");
          await service.deleteEntity({ entityType: "topic", id });
        },
        enqueue: async (delayMs = 0) => {
          await context.jobs.enqueue({
            type: "topics:extract",
            data: {},
            options: {
              delayMs,
              source: "topics-test",
              metadata: { operationType: "data_processing" },
            },
          });
        },
        changed: async (changed) => {
          await context.messaging.send({
            type: "topics:batch-completed",
            payload: { changed },
            broadcast: true,
          });
        },
      },
      config,
      createTopicCheckpoints(context.runtimeState),
    );
  const addTopic = (title: string, id = title.toLowerCase()): BaseEntity => {
    const topic = createTestEntity("topic", {
      id,
      visibility: "public",
      content: createTopicBody({
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
        options: expect.objectContaining({ delayMs: 0 }),
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
    expect(await lock.get("lease")).toMatchObject({ expiresAt: 0 });
    expect((await lock.get("lease"))?.owner).toEndWith(":released");
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
    const abstainedSource = f.entities.get("note:note-002");
    if (!abstainedSource) throw new Error("missing source");
    expect(await f.store.get("note:note-002")).toEqual({
      revision: sourceRevision(abstainedSource),
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

  it("pages source bodies and rechecks every prompted source before checkpointing", async () => {
    const f = fixture(45);
    await f.run();
    expect(f.sourceListLimits.length).toBeGreaterThan(0);
    expect(f.sourceListLimits.every((limit) => limit !== undefined)).toBe(true);
    expect(f.service.getEntity).toHaveBeenCalledTimes(80);
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
    expect(await f.store.get("note:note-000")).toBeNull();
    expect(f.context.jobs.enqueue).toHaveBeenCalled();
  });

  it("invalidates metadata-only edits during voting even when the body hash stays unchanged", async () => {
    const f = fixture(1, { propose: true });
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
        metadata: { ...source.metadata, title: "Edited title" },
      });
      return result;
    };
    expect(await f.run()).toMatchObject({ remaining: 1 });
    expect(await f.store.list()).toEqual([]);
    expect(f.service.createEntity).not.toHaveBeenCalled();
  });

  it("a configured status allowlist cannot lower the public publication floor", async () => {
    const f = fixture(2, {
      propose: true,
      config: { extractableStatuses: ["published", "draft"] },
    });
    for (const [key, source] of f.entities)
      f.entities.set(key, { ...source, metadata: { status: "draft" } });
    await f.run();
    expect(f.calls).toEqual([]);
    expect(await f.store.list()).toEqual([]);
    expect(f.service.createEntity).not.toHaveBeenCalled();
  });

  it("does not write results after another worker takes the lease during generation", async () => {
    const f = fixture(2, { propose: true });
    const lock = f.context.runtimeState.scoped({
      namespace: "topics.extraction",
      schema: z.object({ owner: z.string(), expiresAt: z.number() }),
    });
    const replacement = {
      owner: "replacement",
      expiresAt: Date.now() + 300000,
    };
    const generate = f.context.ai.generate;
    f.context.ai.generate = async <T>(
      config: ContentGenerationConfig,
      schema: AIGenerationSchema<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      const result = await generate(config, schema, signal);
      await lock.set("lease", replacement);
      return result;
    };
    expect(await f.run().catch(caughtError)).toHaveProperty(
      "message",
      "Topic extraction lease was superseded",
    );
    expect(await f.store.list()).toEqual([]);
    expect(f.service.createEntity).not.toHaveBeenCalled();
    expect(await lock.get("lease")).toEqual(replacement);
  });

  it("does not delete a successor admitted immediately after the release CAS", async () => {
    const f = fixture(1);
    const lockSchema = z.object({ owner: z.string(), expiresAt: z.number() });
    const lock = f.context.runtimeState.scoped({
      namespace: "topics.extraction",
      schema: lockSchema,
    });
    const replacement = { owner: "successor", expiresAt: Date.now() + 300000 };
    const scoped = f.context.runtimeState.scoped.bind(f.context.runtimeState);
    f.context.runtimeState.scoped = <T, TInput>(
      options: RuntimeStateScopeOptions<T, TInput>,
    ): IRuntimeStateStore<T, TInput> => {
      const store = scoped(options);
      if (options.namespace === "topics.extraction") {
        const compare = store.compareAndSet.bind(store);
        return {
          ...store,
          compareAndSet: async (
            ...args: Parameters<typeof compare>
          ): Promise<boolean> => {
            const changed = await compare(...args);
            const value = lockSchema.safeParse(args[2]);
            if (
              changed &&
              value.success &&
              /:releas(?:ed|ing)$/.test(value.data.owner)
            )
              await lock.set("lease", replacement);
            return changed;
          },
        };
      }
      return store;
    };
    await f.run();
    expect(await lock.get("lease")).toEqual(replacement);
  });

  it("preserves a replacement candidate withdrawn after the last active-topic read", async () => {
    const f = fixture(2, { propose: true });
    for (const title of ["Weak", "Z1", "Z2", "Z3", "Z4"]) f.addTopic(title);
    let armed = false;
    const generate = f.context.ai.generate;
    f.context.ai.generate = async <T>(
      config: ContentGenerationConfig,
      schema: AIGenerationSchema<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      const result = await generate(config, schema, signal);
      if (config.templateName === "topics:description") armed = true;
      return result;
    };
    const scoped = f.context.runtimeState.scoped.bind(f.context.runtimeState);
    f.context.runtimeState.scoped = <T, TInput>(
      options: RuntimeStateScopeOptions<T, TInput>,
    ): IRuntimeStateStore<T, TInput> => {
      const store = scoped(options);
      if (options.namespace !== "topics.extraction") return store;
      const get = store.get.bind(store);
      return {
        ...store,
        get: async (key: string): Promise<T | null> => {
          const value = await get(key);
          if (armed) {
            const selected = f.entities.get("topic:weak");
            if (!selected) throw new Error("Missing replacement candidate");
            f.entities.set("topic:weak", {
              ...selected,
              visibility: "restricted",
            });
            armed = false;
          }
          return value;
        },
      };
    };
    expect(await f.run().catch(caughtError)).toMatchObject({
      code: "conflict",
    });
    expect(f.entities.get("topic:weak")?.visibility).toBe("restricted");
    expect(f.service.deleteEntity).not.toHaveBeenCalled();
    await f.run("retry");
    expect(f.entities.get("topic:weak")?.visibility).toBe("restricted");
    expect(
      [...f.entities.values()].filter(
        (entry) =>
          entry.entityType === "topic" && entry.visibility === "public",
      ),
    ).toHaveLength(5);
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
