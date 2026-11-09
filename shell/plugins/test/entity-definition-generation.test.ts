import { describe, expect, it } from "bun:test";
import { fetchVoiceGuidance } from "@brains/contracts";
import {
  buildGenerationStubEntity,
  type BaseEntity,
  type CreateExecutionContext,
  type CreateInput,
} from "@brains/entity-service";
import type { ContentGenerationConfig } from "../src/contracts/generation";
import type { JobHandler } from "@brains/job-queue";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { queuedByPackage } from "../src/test/package-job-data";
import {
  createTemplate,
  defineEntity,
  defineEntityJob,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityGenerationContext,
  type EntityJobContext,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const caller: CreateExecutionContext = {
  interfaceType: "cli",
  actor: { kind: "user", userId: "tester" },
  userPermissionLevel: "admin",
};

/** What a job the caller starts through a route records about them. */
const callerAuthority = {
  actor: caller.actor,
  permissionCeiling: "admin",
  principalId: "tester",
};

const noteMetadata = z.object({
  title: z.string(),
  status: z.string().optional(),
  coverImageId: z.string().optional(),
});

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<Harness> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "notes", entities }),
    {},
    { name: "@fixture/notes", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-generation"),
    // The caller who creates through a route is signed in as an admin.
    resolvePrincipal: async () => ({
      userId: "tester",
      permissionLevel: "admin",
    }),
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return harness;
}

function handlerFor(harness: Harness, type: string): JobHandler {
  const handler = harness.getMockShell().getJobQueueService().getHandler(type);
  if (!handler) throw new Error(`No job handler registered for ${type}`);
  return handler;
}

async function run(
  harness: Harness,
  type: string,
  data: unknown,
): Promise<unknown> {
  const handler = handlerFor(harness, type);
  const parsed = handler.validateAndParse(data);
  if (parsed === null) throw new Error(`Job data refused for ${type}`);
  return handler.process(
    parsed,
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

function stored(
  harness: Harness,
  entityType: string,
  id: string,
): Promise<BaseEntity | null> {
  return harness.getEntityService().getEntity({
    entityType,
    id,
    visibilityScope: "restricted",
  });
}

/** A job this package queued for itself, as the runtime queues it. */
function asPackage(input: unknown, entityId?: string): unknown {
  return queuedByPackage("@fixture/notes", input, { entityId });
}

async function enqueued(
  harness: Harness,
): Promise<{ type: string; data: unknown }[]> {
  const jobs = await harness
    .getMockShell()
    .getJobQueueService()
    .getRecentJobs(undefined, 50);
  return jobs.map(({ type, data }) => ({ type, data: JSON.parse(data) }));
}

describe("declared entity jobs", () => {
  it("registers a job under the entity's scope and hands it a frozen context", async () => {
    let given: EntityJobContext<{ readonly count: number }> | undefined;
    const tally = defineEntityJob({
      input: z.object({ count: z.number().int() }),
      handle: async (context) => {
        given = context;
        await context.progress.report({ progress: 50, message: "halfway" });
        return { doubled: context.input.count * 2 };
      },
    });
    const harness = await install([
      defineEntity({
        type: "memo",
        purpose: "Runs a job.",
        metadata: noteMetadata,
        jobs: { tally },
      }),
    ]);
    try {
      expect(
        await run(
          harness,
          "@fixture/notes:memo:tally",
          asPackage({ count: 2 }),
        ),
      ).toEqual({ doubled: 4 });
      expect(
        handlerFor(harness, "@fixture/notes:memo:tally").validateAndParse(
          asPackage({ count: "two" }),
        ),
      ).toBeNull();
      if (!given) throw new Error("The job was not given a context");
      expect(Object.isFrozen(given)).toBe(true);
      expect(Object.keys(given).sort()).toEqual([
        "entities",
        "input",
        "messaging",
        "progress",
        "signal",
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("refuses a job that both handles and generates, or a scoped name", () => {
    const declaration = {
      input: z.object({}),
      handle: async (): Promise<null> => null,
    };
    Object.assign(declaration, {
      generate: async (): Promise<object> => ({}),
    });
    expect(() => defineEntityJob(declaration)).toThrow(
      "either handles or generates",
    );
    expect(() =>
      defineEntity({
        type: "memo",
        purpose: "Names a scoped job.",
        metadata: noteMetadata,
        jobs: {
          "other:job": defineEntityJob({
            input: z.object({}),
            handle: async () => null,
          }),
        },
      }),
    ).toThrow();
  });
});

describe("declared generation", () => {
  const draftInput = z.object({
    prompt: z.string().optional(),
    title: z.string().optional(),
    fail: z.boolean().optional(),
    explode: z.boolean().optional(),
  });

  function memoWithGeneration(seen: {
    context?: EntityGenerationContext<unknown>;
  }): AnyEntityDefinition {
    return defineEntity({
      type: "memo",
      purpose: "Writes itself from a prompt.",
      metadata: noteMetadata,
      templates: {
        draft: createTemplate({
          name: "draft",
          description: "Drafts a memo",
          schema: z.object({ body: z.string() }),
          basePrompt: "Draft a memo.",
          requiredPermission: "admin",
        }),
      },
      stub: ({ title }) => ({
        content: "",
        metadata: { title, status: "generating" },
      }),
      generation: {
        input: draftInput,
        generate: async (context) => {
          seen.context = context;
          if (context.input.fail) {
            return { success: false, error: "Nothing to write about" };
          }
          if (context.input.explode) throw new Error("Model unavailable");
          const title = context.input.title ?? "Generated memo";
          return {
            success: true,
            content: `About: ${context.input.prompt ?? "nothing"}`,
            metadata: { title },
            resultExtras: { words: 2 },
          };
        },
      },
    });
  }

  it("registers as the type's generation job and creates from the result", async () => {
    const seen: { context?: EntityGenerationContext<unknown> } = {};
    const harness = await install([memoWithGeneration(seen)]);
    try {
      expect(
        await run(
          harness,
          "memo:generation",
          asPackage({ prompt: "tides", title: "Tides" }),
        ),
      ).toEqual({ success: true, entityId: "tides", words: 2 });
      expect((await stored(harness, "memo", "tides"))?.metadata).toEqual({
        title: "Tides",
      });
      expect(seen.context?.entityId).toBeUndefined();
      expect(Object.isFrozen(seen.context)).toBe(true);
    } finally {
      await harness.reset();
    }
  });

  it("fills the stub system_generate allocated through main's lifecycle", async () => {
    const seen: { context?: EntityGenerationContext<unknown> } = {};
    const harness = await install([memoWithGeneration(seen)]);
    try {
      const stub = buildGenerationStubEntity(harness.getEntityRegistry(), {
        entityType: "memo",
        id: "allocated",
        title: "Allocated",
      });
      if (!stub) throw new Error("The declared stub was not used");
      expect(stub.metadata).toEqual({
        title: "Allocated",
        status: "generating",
      });
      await harness.getEntityService().createEntity({ entity: stub });

      expect(
        await run(
          harness,
          "memo:generation",
          asPackage({ prompt: "harbours", title: "Allocated" }, "allocated"),
        ),
      ).toMatchObject({ success: true, entityId: "allocated" });
      expect(seen.context?.entityId).toBe("allocated");
      const filled = await stored(harness, "memo", "allocated");
      expect(filled?.content).toContain("About: harbours");
      expect(filled?.metadata["status"]).toBeUndefined();
    } finally {
      await harness.reset();
    }
  });

  it("marks the allocated entity failed when generation refuses or throws", async () => {
    const harness = await install([memoWithGeneration({})]);
    try {
      await harness.getEntityService().createEntity({
        entity: {
          id: "doomed",
          entityType: "memo",
          content: "",
          metadata: { title: "Doomed", status: "generating" },
        },
      });
      expect(
        await run(
          harness,
          "memo:generation",
          asPackage({ fail: true }, "doomed"),
        ),
      ).toEqual({ success: false, error: "Nothing to write about" });
      expect((await stored(harness, "memo", "doomed"))?.metadata).toMatchObject(
        {
          status: "failed",
          error: "Nothing to write about",
        },
      );

      await harness.getEntityService().createEntity({
        entity: {
          id: "exploded",
          entityType: "memo",
          content: "",
          metadata: { title: "Exploded", status: "generating" },
        },
      });
      expect(
        await run(
          harness,
          "memo:generation",
          asPackage({ explode: true }, "exploded"),
        ),
      ).toMatchObject({ success: false });
      expect(
        (await stored(harness, "memo", "exploded"))?.metadata,
      ).toMatchObject({ status: "failed", error: "Model unavailable" });
    } finally {
      await harness.reset();
    }
  });

  it("generates through the type's own templates, in the brain's voice when asked", async () => {
    const configs: ContentGenerationConfig[] = [];
    const memo = defineEntity({
      type: "memo",
      purpose: "Writes through its template.",
      metadata: noteMetadata,
      templates: {
        draft: createTemplate({
          name: "draft",
          description: "Drafts a memo",
          schema: z.object({ body: z.string() }),
          basePrompt: "Draft a memo.",
          requiredPermission: "admin",
        }),
      },
      generation: {
        input: z.object({ prompt: z.string(), voice: z.boolean() }),
        generate: async ({ ai, input }) => {
          const { body } = await ai.generate(
            { template: "draft", prompt: input.prompt, voice: input.voice },
            z.object({ body: z.string() }),
          );
          return {
            success: true,
            content: body,
            metadata: { title: input.prompt },
          };
        },
      },
    });
    const harness = await install([memo]);
    try {
      await harness.getEntityService().createEntity({
        entity: {
          id: "style-guide",
          entityType: "style-guide",
          content:
            "---\nname: House style\nvoice:\n  summary: Plain and direct\n---\nShort sentences.",
          metadata: {},
        },
      });
      const voice = await fetchVoiceGuidance(harness.getEntityService());
      expect(voice).toContain("Plain and direct");
      const shell = harness.getMockShell();
      shell.generateContent = async (config): Promise<unknown> => {
        configs.push(config);
        return { body: `Body for ${config.prompt}` };
      };
      await run(
        harness,
        "memo:generation",
        asPackage({ prompt: "plain", voice: false }),
      );
      await run(
        harness,
        "memo:generation",
        asPackage({ prompt: "voiced", voice: true }),
      );
      expect(configs.map(({ templateName }) => templateName)).toEqual([
        "@fixture/notes:memo:draft",
        "@fixture/notes:memo:draft",
      ]);
      expect(configs[0]?.styleGuide).toBeUndefined();
      expect(configs[1]?.styleGuide).toEqual({ voice });
      expect((await stored(harness, "memo", "voiced"))?.content).toContain(
        "Body for voiced",
      );
    } finally {
      await harness.reset();
    }
  });

  it("refuses a template the type does not declare", async () => {
    const harness = await install([
      defineEntity({
        type: "memo",
        purpose: "Names a template it lacks.",
        metadata: noteMetadata,
        generation: {
          input: z.object({}),
          generate: async ({ ai }) => {
            await ai.generate(
              { template: "missing", prompt: "x" },
              z.object({}),
            );
            return { success: true, content: "", metadata: { title: "x" } };
          },
        },
      }),
    ]);
    try {
      expect(
        await run(harness, "memo:generation", asPackage({})),
      ).toMatchObject({
        success: false,
      });
    } finally {
      await harness.reset();
    }
  });

  it("leaves system_generate unsupported for a type without a stub", async () => {
    const harness = await install([
      defineEntity({
        type: "plain",
        purpose: "No stub declared.",
        metadata: noteMetadata,
      }),
    ]);
    try {
      expect(
        buildGenerationStubEntity(harness.getEntityRegistry(), {
          entityType: "plain",
          id: "x",
          title: "x",
        }),
      ).toBeUndefined();
    } finally {
      await harness.reset();
    }
  });
});

describe("linking what a generation produced", () => {
  // The fields a link writes are the target's own metadata, as a declared
  // type's frontmatter is.
  const post = defineEntity({
    type: "post",
    purpose: "Holds a cover and a list of renders.",
    metadata: z.object({
      title: z.string(),
      coverImageId: z.string().optional(),
      renders: z.array(z.object({ id: z.string() })).default([]),
    }),
    coverImage: true,
  });
  const plainTarget = defineEntity({
    type: "jotting",
    purpose: "Has no cover image.",
    metadata: z.object({ title: z.string() }),
  });
  const render = defineEntity({
    type: "render",
    purpose: "A rendered artifact linked into its source.",
    metadata: z.object({ title: z.string() }),
    generation: {
      input: z.object({
        target: z.string(),
        targetType: z.string(),
        mode: z.enum(["cover", "list"]),
      }),
      generate: async ({ input }) => ({
        success: true,
        id: `render-${input.target}`,
        content: "rendered",
        metadata: { title: "Render" },
        linkInto:
          input.mode === "cover"
            ? {
                entityType: input.targetType,
                entityId: input.target,
                field: "coverImageId",
              }
            : {
                entityType: input.targetType,
                entityId: input.target,
                list: "renders",
                replaces: ["render-stale"],
              },
      }),
    },
  });

  async function seedTargets(harness: Harness): Promise<void> {
    await harness.getEntityService().createEntity({
      entity: {
        id: "essay",
        entityType: "post",
        content: "Body",
        metadata: {
          title: "Essay",
          renders: [{ id: "render-stale" }, { id: "kept" }],
        },
      },
    });
    await harness.getEntityService().createEntity({
      entity: {
        id: "scribble",
        entityType: "jotting",
        content: "---\ntitle: Scribble\n---\nBody",
        metadata: { title: "Scribble" },
      },
    });
  }

  it("sets a cover field or extends a list on the target", async () => {
    const harness = await install([post, plainTarget, render]);
    try {
      await seedTargets(harness);
      await run(
        harness,
        "render:generation",
        asPackage({ target: "essay", targetType: "post", mode: "cover" }),
      );
      expect((await stored(harness, "post", "essay"))?.metadata).toMatchObject({
        coverImageId: "render-essay",
      });
      await run(
        harness,
        "render:generation",
        asPackage({ target: "essay", targetType: "post", mode: "list" }),
      );
      const linked = await stored(harness, "post", "essay");
      expect(linked?.metadata["renders"]).toEqual([
        { id: "kept" },
        { id: "render-essay" },
      ]);
      expect(linked?.content).toBe("Body");
    } finally {
      await harness.reset();
    }
  });

  it("refuses before writing when the target is missing or takes no cover", async () => {
    const harness = await install([post, plainTarget, render]);
    try {
      await seedTargets(harness);
      expect(
        await run(
          harness,
          "render:generation",
          asPackage({ target: "absent", targetType: "post", mode: "cover" }),
        ),
      ).toMatchObject({ success: false });
      expect(await stored(harness, "render", "render-absent")).toBeNull();
      expect(
        await run(
          harness,
          "render:generation",
          asPackage({
            target: "scribble",
            targetType: "jotting",
            mode: "cover",
          }),
        ),
      ).toEqual({
        success: false,
        error: "Entity type 'jotting' doesn't support cover images",
      });
      // A declared type's metadata is its frontmatter: a link into a field its
      // schema does not declare would be stored where no read reaches it.
      expect(
        await run(
          harness,
          "render:generation",
          asPackage({
            target: "scribble",
            targetType: "jotting",
            mode: "list",
          }),
        ),
      ).toEqual({
        success: false,
        error:
          "Entity type 'jotting' declares no metadata field 'renders' to link into",
      });
      expect(await stored(harness, "render", "render-scribble")).toBeNull();
    } finally {
      await harness.reset();
    }
  });
});

describe("create routes that allocate and delegate", () => {
  const importInput = z.object({ source: z.string() });
  const memo = defineEntity({
    type: "memo",
    purpose: "Allocates now and fills in later.",
    metadata: noteMetadata,
    jobs: {
      import: defineEntityJob({
        input: importInput,
        generate: async ({ input }) => ({
          success: true,
          content: `Imported ${input.source}`,
          metadata: { title: input.source },
        }),
      }),
      reindex: defineEntityJob({
        input: z.object({ reason: z.string() }),
        handle: async () => null,
      }),
    },
    create: {
      fromContent: {
        resolve: async ({ input }) => {
          switch (input.title) {
            case "unknown-job":
              return {
                create: { id: "x", content: "", metadata: { title: "x" } },
                delegate: { job: "missing", input: {} },
              };
            case "plain-job":
              return {
                create: { id: "x", content: "", metadata: { title: "x" } },
                delegate: { job: "reindex", input: { reason: "x" } },
              };
            case "bad-input":
              return {
                create: { id: "x", content: "", metadata: { title: "x" } },
                delegate: { job: "import", input: { source: 3 } },
              };
            case "existing":
              return {
                existing: { id: "kept" },
                delegate: { job: "import", input: { source: "again" } },
              };
            case "just-delegate":
              return {
                delegate: { job: "reindex", input: { reason: "asked" } },
              };
            default:
              return {
                create: {
                  id: input.title ?? "imported",
                  content: "",
                  metadata: { title: "Importing", status: "generating" },
                },
                delegate: { job: "import", input: { source: "file.md" } },
                attachment: ({
                  entityId,
                }): { mediaType: string; url: string } => ({
                  mediaType: "text/markdown",
                  url: `/memos/${entityId}`,
                }),
              };
          }
        },
      },
    },
  });

  async function intercept(
    harness: Harness,
    input: CreateInput,
  ): Promise<unknown> {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("memo");
    if (!interceptor) throw new Error("No create interceptor registered");
    return interceptor(input, caller);
  }

  it("writes a placeholder, then hands its id to the declared generation job", async () => {
    const harness = await install([memo]);
    try {
      const outcome = await intercept(harness, {
        entityType: "memo",
        title: "draft",
        content: "x",
      });
      expect(outcome).toMatchObject({
        kind: "handled",
        result: {
          success: true,
          data: {
            status: "generating",
            entityId: "draft",
            attachment: { mediaType: "text/markdown", url: "/memos/draft" },
          },
        },
      });
      expect((await stored(harness, "memo", "draft"))?.metadata).toEqual({
        title: "Importing",
        status: "generating",
      });
      const queued = await enqueued(harness);
      expect(queued).toEqual([
        {
          type: "@fixture/notes:memo:import",
          data: {
            authority: callerAuthority,
            input: { source: "file.md" },
            entityId: "draft",
          },
        },
      ]);
      await run(harness, "@fixture/notes:memo:import", queued[0]?.data);
      expect((await stored(harness, "memo", "draft"))?.content).toContain(
        "Imported file.md",
      );
    } finally {
      await harness.reset();
    }
  });

  it("delegates against an entity that exists, and only one that does", async () => {
    const harness = await install([memo]);
    try {
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "existing",
          content: "x",
        }),
      ).toEqual({
        kind: "handled",
        result: {
          success: false,
          error: 'Cannot reuse memo "kept", which does not exist',
        },
      });
      await harness.getEntityService().createEntity({
        entity: {
          id: "kept",
          entityType: "memo",
          content: "",
          metadata: { title: "Kept" },
        },
      });
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "existing",
          content: "x",
        }),
      ).toMatchObject({
        result: {
          success: true,
          data: { status: "generating", entityId: "kept" },
        },
      });
      expect(await enqueued(harness)).toEqual([
        {
          type: "@fixture/notes:memo:import",
          data: {
            authority: callerAuthority,
            input: { source: "again" },
            entityId: "kept",
          },
        },
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("delegates without allocating to any declared job", async () => {
    const harness = await install([memo]);
    try {
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "just-delegate",
          content: "x",
        }),
      ).toMatchObject({
        result: { success: true, data: { status: "generating" } },
      });
      expect(await enqueued(harness)).toEqual([
        {
          type: "@fixture/notes:memo:reindex",
          data: { authority: callerAuthority, input: { reason: "asked" } },
        },
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("refuses a delegation it cannot honour, before writing anything", async () => {
    const harness = await install([memo]);
    try {
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "unknown-job",
          content: "x",
        }),
      ).toEqual({
        kind: "handled",
        result: {
          success: false,
          error: 'memo declares no job named "missing"',
        },
      });
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "plain-job",
          content: "x",
        }),
      ).toEqual({
        kind: "handled",
        result: {
          success: false,
          error:
            'memo job "reindex" does not generate, so it cannot fill an allocated entity',
        },
      });
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "bad-input",
          content: "x",
        }),
      ).toMatchObject({ result: { success: false } });
      expect(await stored(harness, "memo", "x")).toBeNull();
      expect(await enqueued(harness)).toEqual([]);
    } finally {
      await harness.reset();
    }
  });
});

describe("a delegated job's input", () => {
  // The schema's input is queued; the job is handed its output, once.
  const counted = z.object({
    count: z.string().transform((count) => Number(count)),
  });
  const seen: unknown[] = [];
  const ledger = defineEntity({
    type: "ledger",
    purpose: "Delegates jobs whose input schema transforms.",
    metadata: noteMetadata,
    jobs: {
      count: defineEntityJob({
        input: counted,
        handle: async ({ input }) => {
          seen.push(input.count);
          return null;
        },
      }),
      grow: defineEntityJob({
        input: counted,
        generate: async ({ input }) => {
          seen.push(input.count);
          return {
            success: true,
            content: `Grew ${input.count}`,
            metadata: { title: "Grown" },
          };
        },
      }),
    },
    create: {
      fromContent: {
        resolve: async ({ input }) =>
          input.title === "grow"
            ? {
                create: {
                  id: "grown",
                  content: "",
                  metadata: { title: "Growing", status: "generating" },
                },
                delegate: { job: "grow", input: { count: "3" } },
              }
            : { delegate: { job: "count", input: { count: "2" } } },
      },
    },
  });

  it("is queued as written and parsed once, when the job runs", async () => {
    const harness = await install([ledger]);
    try {
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("ledger");
      if (!interceptor) throw new Error("No create interceptor registered");
      for (const title of ["count", "grow"]) {
        await interceptor(
          { entityType: "ledger", title, content: "x" },
          caller,
        );
      }
      for (const { type, data } of await enqueued(harness)) {
        await run(harness, type, data);
      }
      expect([...seen].sort()).toEqual([2, 3]);
      expect((await stored(harness, "ledger", "grown"))?.content).toContain(
        "Grew 3",
      );
    } finally {
      await harness.reset();
    }
  });
});
