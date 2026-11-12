import { describe, expect, it, mock, type Mock } from "bun:test";
import { generateExecuteContract } from "@brains/contracts";
import {
  CallerAuthorizationError,
  type CallerPrincipal,
} from "@brains/content-service";
import type { ActorRef } from "@brains/contracts";
import type {
  BaseEntity,
  ContentVisibility,
  CreateExecutionContext,
  CreateInput,
} from "@brains/entity-service";
import type { JobHandler } from "@brains/job-queue";
import { PermissionService } from "@brains/templates";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { deriveProjectionUpserts } from "../src/entity/declarative-entity-plugin";
import {
  createServicePluginContext,
  defineEntity,
  defineEntityJob,
  defineEntityPackage,
  defineProjection,
  instantiatePluginPackageDefinition,
  type EntityCheckResult,
  type EntityReader,
  type Plugin,
  type ToolContext,
} from "../src";

// A type another package keeps: a job reads it as whoever started the job.
const note = defineEntity({
  type: "private-note",
  purpose: "A note at one visibility",
  metadata: z.object({}),
});

const visibilities: ContentVisibility[] = ["public", "shared", "restricted"];
const allNotes = ["public-note", "shared-note", "restricted-note"];

/** The notes this read can see, in order. */
async function visibleNotes(entities: EntityReader): Promise<string[]> {
  const reads = await Promise.all(
    allNotes.map(async (id) => ((await entities.get(note, id)) ? id : null)),
  );
  return reads.flatMap((id) => (id ? [id] : []));
}

const memoMetadata = z.object({
  title: z.string(),
  status: z.string().optional(),
  renders: z.array(z.object({ id: z.string() })).default([]),
});

/** What each job saw, in the order the jobs ran. */
const seen: { job: string; notes: string[]; ownRestricted?: boolean }[] = [];

const memo = defineEntity({
  type: "memo",
  purpose: "Reads notes in the jobs its create routes delegate to.",
  metadata: memoMetadata,
  stub: ({ title }) => ({
    content: "",
    metadata: { title, status: "generating" },
  }),
  jobs: {
    peek: defineEntityJob({
      input: z.object({ reason: z.string() }),
      handle: async ({ entities }) => {
        const notes = await visibleNotes(entities);
        seen.push({ job: "peek", notes });
        return { found: notes };
      },
    }),
    draft: defineEntityJob({
      input: z.object({ reason: z.string() }),
      generate: async ({ entities }) => {
        const notes = await visibleNotes(entities);
        seen.push({ job: "draft", notes });
        return {
          success: true,
          content: notes.join(","),
          metadata: { title: "Drafted" },
        };
      },
    }),
    render: defineEntityJob({
      input: z.object({}),
      generate: async (_context) => ({
        success: true,
        id: "render",
        content: "Rendered",
        metadata: { title: "Render" },
        linkInto: {
          entityType: "memo",
          entityId: "kept-memo",
          list: "renders",
        },
      }),
    }),
  },
  generation: {
    input: z.object({ prompt: z.string() }),
    generate: async ({ entities }) => {
      const notes = await visibleNotes(entities);
      seen.push({ job: "generation", notes });
      return {
        success: true,
        content: notes.join(","),
        metadata: { title: "Prompted" },
      };
    },
  },
  create: {
    fromContent: {
      resolve: async ({ input }) => {
        switch (input.title) {
          case "draft":
            return {
              create: {
                id: "drafted",
                content: "",
                metadata: { title: "Drafting", status: "generating" },
              },
              delegate: { job: "draft", input: { reason: "asked" } },
            };
          case "render":
            return { delegate: { job: "render", input: {} } };
          default:
            return { delegate: { job: "peek", input: { reason: "asked" } } };
        }
      },
    },
  },
});

// Written on a schedule: the package starts it, so it reads as the package.
const digest = defineEntity({
  type: "digest",
  purpose: "Written on a schedule from essays.",
  metadata: z.object({ title: z.string() }),
  scheduledGeneration: {
    from: { entityType: "essay", limit: 10 },
    mode: "batch",
  },
  generation: {
    input: z.object({
      sourceEntityType: z.string().optional(),
      sourceEntityIds: z.array(z.string()).optional(),
    }),
    generate: async ({ entities }) => {
      const notes = await visibleNotes(entities);
      // Its own types are the package's at every visibility.
      const ownRestricted = (await entities.get(memo, "kept-memo")) !== null;
      seen.push({ job: "digest", notes, ownRestricted });
      return {
        success: true,
        id: "digest",
        content: "Digest",
        metadata: { title: "Digest" },
      };
    },
  },
});

/** What the package sees acting as itself in a slot no caller is behind. */
async function lookAsPackage(
  slot: string,
  entities: EntityReader,
): Promise<void> {
  seen.push({
    job: slot,
    notes: await visibleNotes(entities),
    ownRestricted: (await entities.get(memo, "kept-memo")) !== null,
  });
}

// A check, an eval and an Inbox listing run with no caller: the package
// acts as itself in each.
const watch = defineEntity({
  type: "watch",
  purpose: "Looks at notes outside any job.",
  metadata: z.object({}),
  checks: [
    {
      id: "peek",
      cadence: "daily",
      deliverAlerts: false,
      includeInInbox: false,
      run: async ({ entities }): Promise<EntityCheckResult> => {
        await lookAsPackage("check", entities);
        return {};
      },
    },
  ],
  evals: {
    peek: async (_input, { entities }) => {
      await lookAsPackage("eval", entities);
      return null;
    },
  },
  inbox: {
    sourceId: "watch",
    displayName: "Watch",
    list: async ({ entities }) => {
      await lookAsPackage("inbox", entities);
      return [];
    },
    act: async () => undefined,
  },
});

const scheduledFromMemos = z.object({
  sourceEntityType: z.string().optional(),
  sourceEntityIds: z.array(z.string()).optional(),
});

// Written on a schedule from the package's own memos, which it reads at
// every visibility: what it writes is no more visible than what it read.
const brief = defineEntity({
  type: "brief",
  purpose: "Written on a schedule from memos.",
  metadata: z.object({ title: z.string() }),
  scheduledGeneration: {
    from: { entityType: "memo", limit: 10 },
    mode: "batch",
  },
  generation: {
    input: scheduledFromMemos,
    generate: async (_context) => ({
      success: true,
      id: "brief",
      content: "Brief",
      metadata: { title: "Brief" },
    }),
  },
});

// The same, but the package says how visible what it writes is.
const notice = defineEntity({
  type: "notice",
  purpose: "Written on a schedule from memos, for everyone.",
  metadata: z.object({ title: z.string() }),
  scheduledGeneration: {
    from: { entityType: "memo", limit: 10 },
    mode: "batch",
  },
  generation: {
    input: scheduledFromMemos,
    generate: async (_context) => ({
      success: true,
      id: "notice",
      content: "Notice",
      metadata: { title: "Notice" },
      visibility: "public",
    }),
  },
});

const packageName = "@fixture/notes";

type Principals = Record<string, CallerPrincipal["permissionLevel"] | null>;

function principalResolver(
  principals: Principals,
): Mock<(actor: ActorRef) => Promise<CallerPrincipal | null>> {
  return mock(async (actor: ActorRef): Promise<CallerPrincipal | null> => {
    if (actor.kind !== "user") return null;
    const level = principals[actor.userId];
    return level ? { userId: actor.userId, permissionLevel: level } : null;
  });
}

function seed(shell: MockShell): void {
  const now = new Date().toISOString();
  const entry = (
    id: string,
    entityType: string,
    visibility: ContentVisibility,
    metadata: Record<string, unknown>,
    content = `A ${visibility} ${entityType}`,
  ): BaseEntity => ({
    id,
    entityType,
    content,
    contentHash: id,
    metadata,
    visibility,
    created: now,
    updated: now,
  });
  shell.addEntities([
    ...visibilities.map((visibility) =>
      entry(`${visibility}-note`, note.type, visibility, {}),
    ),
    // A memo's metadata is its frontmatter.
    entry(
      "kept-memo",
      memo.type,
      "restricted",
      { title: "Kept", renders: [] },
      "---\ntitle: Kept\nrenders: []\n---\nA restricted memo",
    ),
    entry("first-essay", "essay", "public", {}),
    entry("shared-essay", "essay", "shared", {}),
  ]);
}

async function install(
  principals: Principals,
  permissions?: PermissionService,
): Promise<{
  shell: MockShell;
  plugins: Plugin[];
  resolvePrincipal: ReturnType<typeof principalResolver>;
  evals: Map<string, (input: unknown) => Promise<unknown>>;
}> {
  seen.splice(0);
  const resolvePrincipal = principalResolver(principals);
  const shell = createMockShell({ resolvePrincipal });
  if (permissions)
    shell.getPermissionService = (): PermissionService => permissions;
  const evals = new Map<string, (input: unknown) => Promise<unknown>>();
  shell.registerEvalHandler = (_pluginId, id, handler): void => {
    evals.set(id, handler);
  };
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({
      id: "notes",
      entities: [memo, digest, watch, brief, notice],
    }),
    {},
    { name: packageName, version: "0.1.0" },
  );
  for (const plugin of plugins) await plugin.register(shell);
  shell.getInboxRegistry().finalize();
  seed(shell);
  return { shell, plugins, resolvePrincipal, evals };
}

function caller(
  userId: string,
  level: "admin" | "trusted" | "public",
): {
  execution: CreateExecutionContext;
  tool: ToolContext;
} {
  const actor: ActorRef = { kind: "user", userId };
  return {
    execution: { interfaceType: "mcp", actor, userPermissionLevel: level },
    tool: { interfaceType: "mcp", actor, userPermissionLevel: level },
  };
}

const jobReference = z.object({
  result: z.object({ data: z.object({ jobId: z.string() }) }),
});

/** Create through the type's route, as system_create does, and name the job it queued. */
async function createThroughRoute(
  shell: MockShell,
  title: string,
  execution: CreateExecutionContext,
  extra: Partial<CreateInput> = {},
): Promise<string> {
  const interceptor = shell.getEntityRegistry().getCreateInterceptor("memo");
  if (!interceptor) throw new Error("No create route for memo");
  const outcome = await interceptor(
    { entityType: "memo", title, content: "x", ...extra },
    execution,
  );
  return jobReference.parse(outcome).result.data.jobId;
}

async function queuedData(shell: MockShell, jobId: string): Promise<unknown> {
  const job = await shell.getJobQueueService().getStatus(jobId);
  if (!job) throw new Error(`Missing job ${jobId}`);
  return JSON.parse(job.data);
}

function handlerFor(shell: MockShell, type: string): JobHandler {
  const handler = shell.getJobQueueService().getHandler(type);
  if (!handler) throw new Error(`No handler for ${type}`);
  return handler;
}

/** Runs one queued job the way the worker does: stored JSON, parse, process. */
async function runQueuedJob(shell: MockShell, jobId: string): Promise<unknown> {
  const job = await shell.getJobQueueService().getStatus(jobId);
  if (!job) throw new Error(`Missing job ${jobId}`);
  const handler = handlerFor(shell, job.type);
  const data = handler.validateAndParse(JSON.parse(job.data));
  if (data === null) throw new Error(`Invalid job data for ${job.type}`);
  return handler.process(
    data,
    job.id,
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function rejection(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error("Expected rejection");
    },
    (error: unknown) => error,
  );
}

async function storedMemo(
  shell: MockShell,
  id: string,
): Promise<BaseEntity | null> {
  return shell
    .getEntityService()
    .getEntity({ entityType: "memo", id, visibilityScope: "restricted" });
}

describe("entity package jobs read as their requester", () => {
  it("a trusted caller's delegated job cannot read a restricted note; an admin's can", async () => {
    const { shell } = await install({
      usr_trusted: "trusted",
      usr_admin: "admin",
    });

    const trusted = await createThroughRoute(
      shell,
      "peek",
      caller("usr_trusted", "trusted").execution,
    );
    const admin = await createThroughRoute(
      shell,
      "peek",
      caller("usr_admin", "admin").execution,
    );

    expect(await runQueuedJob(shell, trusted)).toEqual({
      found: ["public-note", "shared-note"],
    });
    expect(await runQueuedJob(shell, admin)).toEqual({ found: allNotes });
  });

  it("a delegated generation reads as its requester", async () => {
    const { shell } = await install({ usr_trusted: "trusted" });

    const jobId = await createThroughRoute(
      shell,
      "draft",
      caller("usr_trusted", "trusted").execution,
    );

    expect(await runQueuedJob(shell, jobId)).toMatchObject({
      success: true,
      entityId: "drafted",
    });
    expect(seen).toEqual([
      { job: "draft", notes: ["public-note", "shared-note"] },
    ]);
    const drafted = await storedMemo(shell, "drafted");
    expect(drafted?.content).toContain("public-note,shared-note");
    expect(drafted?.content).not.toContain("restricted-note");
  });

  it("queues the requester's authority beside the input, and refuses data without it", async () => {
    const { shell } = await install({ usr_trusted: "trusted" });
    const { execution } = caller("usr_trusted", "trusted");

    const peek = await createThroughRoute(shell, "peek", execution);
    const draft = await createThroughRoute(shell, "draft", execution);

    const authority = {
      actor: execution.actor,
      permissionCeiling: "trusted",
      principalId: "usr_trusted",
    };
    expect(await queuedData(shell, peek)).toEqual({
      authority,
      input: { reason: "asked" },
    });
    // The allocated entity is the runtime's, beside the input it was given.
    expect(await queuedData(shell, draft)).toEqual({
      authority,
      input: { reason: "asked" },
      entityId: "drafted",
    });

    // Data queued before requester authority existed is invalid, not run.
    expect(
      handlerFor(shell, `${packageName}:memo:peek`).validateAndParse({
        reason: "asked",
      }),
    ).toBeNull();
    expect(
      handlerFor(shell, `${packageName}:memo:draft`).validateAndParse({
        reason: "asked",
        entityId: "drafted",
      }),
    ).toBeNull();
    // The type's own generation, which its entity plugin class queued in
    // this shape, reads it as a legacy job the package runs.
    expect(
      handlerFor(shell, "memo:generation").validateAndParse({
        prompt: "tides",
        entityId: "prompted",
      }),
    ).toEqual({
      legacyRawData: true,
      input: { prompt: "tides" },
      entityId: "prompted",
    });
  });

  it("refuses a job and a generation whose requester is revoked before they run", async () => {
    const principals: Principals = { usr_admin: "admin" };
    const { shell } = await install(principals);
    const { execution } = caller("usr_admin", "admin");
    const peek = await createThroughRoute(shell, "peek", execution);
    const draft = await createThroughRoute(shell, "draft", execution);

    principals["usr_admin"] = null;

    expect(await rejection(runQueuedJob(shell, peek))).toBeInstanceOf(
      CallerAuthorizationError,
    );
    expect(await rejection(runQueuedJob(shell, draft))).toBeInstanceOf(
      CallerAuthorizationError,
    );
    expect(seen).toEqual([]);
  });

  it("queues system_generate's generation with its caller's authority", async () => {
    const { shell } = await install({ usr_trusted: "trusted" });
    const enqueue = shell.getEntityRegistry().getGenerationEnqueuer("memo");
    if (!enqueue) throw new Error("memo queues no generation of its own");
    await shell.getEntityService().createEntity({
      entity: {
        id: "prompted",
        entityType: "memo",
        content: "",
        metadata: { title: "Prompted", status: "generating" },
      },
    });

    const jobId = await enqueue(
      { entityId: "prompted", prompt: "tides" },
      caller("usr_trusted", "trusted").tool,
    );

    expect(await queuedData(shell, jobId)).toEqual({
      authority: {
        actor: { kind: "user", userId: "usr_trusted" },
        permissionCeiling: "trusted",
        principalId: "usr_trusted",
      },
      input: { prompt: "tides" },
      entityId: "prompted",
    });
    await runQueuedJob(shell, jobId);
    expect(seen).toEqual([
      { job: "generation", notes: ["public-note", "shared-note"] },
    ]);
    // Written from no source, it keeps the allocated entry's visibility.
    expect((await storedMemo(shell, "prompted"))?.visibility).toBe("public");
  });
});

describe("a generation writes as its requester", () => {
  it("fills an allocated entry only while its requester may still see it", async () => {
    const principals: Principals = { usr_admin: "admin" };
    const { shell } = await install(principals);
    const jobId = await createThroughRoute(
      shell,
      "draft",
      caller("usr_admin", "admin").execution,
      { visibility: "restricted" },
    );

    // Still signed in, but no longer allowed restricted entries.
    principals["usr_admin"] = "trusted";

    expect(await runQueuedJob(shell, jobId)).toMatchObject({ success: false });
    expect(seen).toEqual([]);
    expect((await storedMemo(shell, "drafted"))?.metadata).toMatchObject({
      status: "failed",
    });
  });

  it("links only into a target its requester can see", async () => {
    const { shell } = await install({ usr_trusted: "trusted" });

    const jobId = await createThroughRoute(
      shell,
      "render",
      caller("usr_trusted", "trusted").execution,
    );

    expect(await runQueuedJob(shell, jobId)).toEqual({
      success: false,
      error: "Target entity not found: memo/kept-memo",
    });
    expect(await storedMemo(shell, "render")).toBeNull();
    expect((await storedMemo(shell, "kept-memo"))?.metadata).toMatchObject({
      renders: [],
    });
  });

  it("is held to the type's create policy at the requester's level when it runs", async () => {
    const { shell } = await install(
      { usr_trusted: "trusted" },
      new PermissionService({ entityActions: { memo: { create: "admin" } } }),
    );

    const jobId = await createThroughRoute(
      shell,
      "draft",
      caller("usr_trusted", "trusted").execution,
    );

    expect(await runQueuedJob(shell, jobId)).toMatchObject({ success: false });
    expect(seen).toEqual([]);
  });
});

/** Runs a type's schedule and its generation, and names the sources it chose. */
async function runSchedule(
  shell: MockShell,
  entityType = "digest",
): Promise<string[]> {
  await createServicePluginContext(shell, "pipeline").messaging.command(
    generateExecuteContract,
    { entityType },
  );
  const queued = await shell.getJobQueueService().getRecentJobs();
  const scheduled = queued.find(
    (job) => job.type === `${entityType}:generation`,
  );
  if (!scheduled) throw new Error(`The schedule queued no ${entityType}`);
  await runQueuedJob(shell, scheduled.id);
  return z
    .object({ input: z.object({ sourceEntityIds: z.array(z.string()) }) })
    .parse(JSON.parse(scheduled.data))
    .input.sourceEntityIds.sort();
}

describe("a generation the package starts on its own", () => {
  it("reads other types at the package's grant, public without one", async () => {
    const { shell, resolvePrincipal } = await install({});

    expect(await runSchedule(shell)).toEqual(["first-essay"]);

    expect(seen).toEqual([
      { job: "digest", notes: ["public-note"], ownRestricted: true },
    ]);
    expect(resolvePrincipal).not.toHaveBeenCalled();
  });

  it("reads public and shared entries with a trusted grant", async () => {
    const { shell, plugins } = await install({});
    const digestPlugin = plugins.find(({ id }) => id.endsWith(":digest"));
    if (!digestPlugin) throw new Error("No digest plugin");
    shell.getPermissionService = (): PermissionService =>
      new PermissionService({ trusted: [`service:${digestPlugin.id}`] });

    // The schedule chooses its sources at the grant as well.
    expect(await runSchedule(shell)).toEqual(["first-essay", "shared-essay"]);

    expect(seen).toEqual([
      {
        job: "digest",
        notes: ["public-note", "shared-note"],
        ownRestricted: true,
      },
    ]);
  });

  it("queues its grant as the job's authority, marked as the package's own", async () => {
    const { shell, plugins } = await install({});
    const digestPlugin = plugins.find(({ id }) => id.endsWith(":digest"));
    if (!digestPlugin) throw new Error("No digest plugin");

    await createServicePluginContext(shell, "pipeline").messaging.command(
      generateExecuteContract,
      { entityType: "digest" },
    );

    const [job] = await shell.getJobQueueService().getRecentJobs();
    if (!job) throw new Error("The schedule queued nothing");
    expect(JSON.parse(job.data)).toEqual({
      authority: {
        actor: { kind: "service", serviceId: digestPlugin.id },
        permissionCeiling: "public",
      },
      input: { sourceEntityType: "essay", sourceEntityIds: ["first-essay"] },
      byPackage: true,
      // What it is written from, recorded by the runtime beside its input.
      source: { entityType: "essay", ids: ["first-essay"] },
    });
  });
});

describe("a package acting as itself with no caller behind it", () => {
  // No grant: other packages' types read public, its own at every visibility.
  const asItself = (slot: string): (typeof seen)[number] => ({
    job: slot,
    notes: ["public-note"],
    ownRestricted: true,
  });

  it("reads so in a scheduled check", async () => {
    const { shell } = await install({});
    const check = shell.getRecurringCheck(`${packageName}:watch:peek`);
    if (!check) throw new Error("The check was not registered");

    await check.run({ signal: new AbortController().signal });

    expect(seen).toEqual([asItself("check")]);
  });

  it("reads so in an eval", async () => {
    const { evals } = await install({});
    const peek = evals.get("peek");
    if (!peek) throw new Error("The eval was not registered");

    await peek({});

    expect(seen).toEqual([asItself("eval")]);
  });

  it("reads so when the Inbox lists what it puts in front of the operator", async () => {
    const { shell } = await install({});
    const source = shell.getInboxRegistry().getSource("watch");
    if (!source) throw new Error("The Inbox source was not registered");

    await source.list();

    expect(seen).toEqual([asItself("inbox")]);
  });

  it("reads other types at the grant the brain gives it", async () => {
    const { shell, plugins } = await install({});
    const watchPlugin = plugins.find(({ id }) => id.endsWith(":watch"));
    if (!watchPlugin) throw new Error("No watch plugin");
    shell.getPermissionService = (): PermissionService =>
      new PermissionService({ trusted: [`service:${watchPlugin.id}`] });
    const check = shell.getRecurringCheck(`${packageName}:watch:peek`);
    if (!check) throw new Error("The check was not registered");

    await check.run({ signal: new AbortController().signal });

    expect(seen).toEqual([
      {
        job: "check",
        notes: ["public-note", "shared-note"],
        ownRestricted: true,
      },
    ]);
  });
});

describe("a generation is no more visible than its source", () => {
  async function stored(
    shell: MockShell,
    entityType: string,
    id: string,
  ): Promise<BaseEntity | null> {
    return shell
      .getEntityService()
      .getEntity({ entityType, id, visibilityScope: "restricted" });
  }

  async function promptedStub(shell: MockShell): Promise<void> {
    await shell.getEntityService().createEntity({
      entity: {
        id: "prompted",
        entityType: "memo",
        content: "",
        metadata: { title: "Prompted", status: "generating" },
      },
    });
  }

  it("writes what a schedule makes from the package's own restricted entry restricted", async () => {
    const { shell } = await install({});

    expect(await runSchedule(shell, "brief")).toEqual(["kept-memo"]);

    expect((await stored(shell, "brief", "brief"))?.visibility).toBe(
      "restricted",
    );
  });

  it("keeps the visibility the package's generation sets", async () => {
    const { shell } = await install({});

    expect(await runSchedule(shell, "notice")).toEqual(["kept-memo"]);

    expect((await stored(shell, "notice", "notice"))?.visibility).toBe(
      "public",
    );
  });

  it("fills an allocated entry no more visibly than the source system_generate names", async () => {
    const { shell } = await install({ usr_admin: "admin" });
    const enqueue = shell.getEntityRegistry().getGenerationEnqueuer("memo");
    if (!enqueue) throw new Error("memo queues no generation of its own");
    await promptedStub(shell);

    const jobId = await enqueue(
      {
        entityId: "prompted",
        prompt: "tides",
        sourceEntityType: note.type,
        sourceEntityId: "shared-note",
        sourceEntityIds: ["shared-note"],
      },
      caller("usr_admin", "admin").tool,
    );

    expect(await queuedData(shell, jobId)).toMatchObject({
      entityId: "prompted",
      source: { entityType: note.type, ids: ["shared-note"] },
    });
    expect(await runQueuedJob(shell, jobId)).toMatchObject({ success: true });
    expect((await stored(shell, "memo", "prompted"))?.visibility).toBe(
      "shared",
    );
  });

  it("writes a delegated generation from a restricted source restricted", async () => {
    const { shell } = await install({ usr_admin: "admin" });

    const jobId = await createThroughRoute(
      shell,
      "draft",
      caller("usr_admin", "admin").execution,
      { sourceEntityType: note.type, sourceEntityId: "restricted-note" },
    );

    expect(await runQueuedJob(shell, jobId)).toMatchObject({ success: true });
    expect((await stored(shell, "memo", "drafted"))?.visibility).toBe(
      "restricted",
    );
  });

  it("refuses a source more private than its requester may write", async () => {
    const { shell } = await install({ usr_trusted: "trusted" });
    const enqueue = shell.getEntityRegistry().getGenerationEnqueuer("memo");
    if (!enqueue) throw new Error("memo queues no generation of its own");
    await promptedStub(shell);

    const jobId = await enqueue(
      {
        entityId: "prompted",
        prompt: "tides",
        sourceEntityType: note.type,
        sourceEntityId: "restricted-note",
      },
      caller("usr_trusted", "trusted").tool,
    );

    expect(await runQueuedJob(shell, jobId)).toMatchObject({ success: false });
    const prompted = await stored(shell, "memo", "prompted");
    expect(prompted?.visibility).toBe("public");
    expect(prompted?.metadata).toMatchObject({ status: "failed" });
  });
});

describe("a projection's target visibility", () => {
  const bookmark = defineEntity({
    type: "bookmark",
    purpose: "A saved page.",
    metadata: z.object({}),
  });
  const card = defineEntity({
    type: "card",
    purpose: "A card derived from a bookmark.",
    metadata: z.object({ sourceId: z.string() }),
  });
  const restrictedSource = {
    id: "saved",
    entityType: "bookmark",
    content: "A private page",
    visibility: "restricted",
    metadata: {},
    contentHash: "hash",
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };

  it("is the source's unless the projection sets one", async () => {
    const inherited = defineProjection({
      id: "bookmark-card",
      source: bookmark,
      target: card,
      async project({ source, target }) {
        await target.upsert({
          id: source.id,
          content: source.content,
          metadata: { sourceId: source.id },
        });
      },
    });
    const published = defineProjection({
      id: "bookmark-public-card",
      source: bookmark,
      target: card,
      async project({ source, target }) {
        await target.upsert({
          id: source.id,
          content: "A card anyone may see",
          visibility: "public",
          metadata: { sourceId: source.id },
        });
      },
    });
    const signal = new AbortController().signal;

    expect(
      await deriveProjectionUpserts(inherited, restrictedSource, signal),
    ).toMatchObject([
      {
        operation: "upsert",
        entity: {
          visibility: "restricted",
          content: expect.stringContaining("visibility: restricted"),
        },
      },
    ]);
    expect(
      await deriveProjectionUpserts(published, restrictedSource, signal),
    ).toMatchObject([
      { operation: "upsert", entity: { visibility: "public" } },
    ]);
  });
});
