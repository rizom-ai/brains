import { afterEach, describe, expect, it, mock } from "bun:test";
import type { CallerPrincipal } from "@brains/content-service";
import type { ActorRef } from "@brains/contracts";
import {
  EntityRegistry,
  EntityService,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import type { JobHandler } from "@brains/job-queue";
import {
  PermissionService,
  type EntityActionPolicyRule,
} from "@brains/templates";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestDirectory,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineEntity,
  defineEntityJob,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type EntityDefinition,
  type EntityJobHandleContext,
} from "../src";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * A declared entity job's `handle` writes the records of the type that
 * declares it, through the same OwnedEntityWriter a service slot is given:
 * as the run's authority, the requester resolved when the job runs or the
 * package acting as itself, and with the service writer's conflicts.
 */

const ledgerMetadata = z.object({ title: z.string() });

// The writes a job is asked to make, each answered with what happened.
const writeSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    id: z.string().optional(),
    visibility: z.enum(["public", "shared", "restricted"]).optional(),
  }),
  z.object({ op: z.literal("update"), id: z.string(), stale: z.boolean() }),
  z.object({ op: z.literal("delete"), id: z.string() }),
  z.object({ op: z.literal("create-sibling") }),
]);

async function outcome(write: () => Promise<unknown>): Promise<unknown> {
  try {
    return { done: await write() };
  } catch (error) {
    // The refusal is what the test reads.
    return { refused: error instanceof Error ? error.message : String(error) };
  }
}

// Another type of the same package: the job may read it, not write it.
const sibling = defineEntity({
  type: "ledger-note",
  purpose: "A note beside the ledger.",
  metadata: ledgerMetadata,
});

const entry: EntityDefinition<"ledger-entry", typeof ledgerMetadata> =
  defineEntity({
    type: "ledger-entry",
    purpose: "A ledger entry its jobs keep.",
    metadata: ledgerMetadata,
    jobs: {
      write: defineEntityJob({
        input: writeSchema,
        handle: async ({
          input,
          entities,
        }: EntityJobHandleContext<
          z.output<typeof writeSchema>
        >): Promise<unknown> => {
          switch (input.op) {
            case "create":
              return outcome(() =>
                entities.create(entry, {
                  ...(input.id !== undefined && { id: input.id }),
                  content: "Written by the job",
                  metadata: { title: "Job entry" },
                  ...(input.visibility !== undefined && {
                    visibility: input.visibility,
                  }),
                }),
              );
            case "update": {
              const read = await entities.get(entry, input.id);
              if (!read) return { refused: "not visible" };
              const record = input.stale
                ? { ...read, contentHash: "stale" }
                : read;
              return outcome(() =>
                entities.update(entry, record, {
                  content: "Updated by the job",
                }),
              );
            }
            case "delete": {
              const read = await entities.get(entry, input.id);
              if (!read) return { refused: "not visible" };
              return outcome(() => entities.delete(entry, read));
            }
            case "create-sibling":
              return outcome(() =>
                entities.create(sibling, {
                  content: "Not the job's type",
                  metadata: { title: "Sibling" },
                }),
              );
          }
        },
      }),
    },
    // Generation contexts read only: the runtime persists what one returns.
    generation: {
      input: z.object({ prompt: z.string() }),
      generate: async ({ entities }) => {
        generationWriter = Object.keys(entities).sort();
        return { success: true, content: "", metadata: { title: "Generated" } };
      },
    },
  });
let generationWriter: string[] | undefined;

const packageName = "@fixture/ledger";
const DIMENSIONS = 1536;

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  generationWriter = undefined;
});

async function install(
  principals: Record<string, CallerPrincipal["permissionLevel"]>,
): Promise<{ shell: MockShell; service: EntityService; pluginId: string }> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "ledger", entities: [entry, sibling] }),
    {},
    { name: packageName, version: "0.1.0" },
  );
  for (const plugin of plugins) {
    if (isDeclaredEntityType(plugin)) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
      );
    }
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: {
        model: "test:mock",
        dimensions: DIMENSIONS,
        promptRevision: 0,
      },
      embedQuery: async () => ({
        embedding: new Float32Array(DIMENSIONS),
        usage: { tokens: 1 },
      }),
      embedDocuments: async (documents: { content: string }[]) => ({
        embeddings: documents.map(() => new Float32Array(DIMENSIONS)),
        usage: { tokens: documents.length },
      }),
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  const entityService: IEntityService = service;
  const shell = createMockShell({
    logger,
    entityService,
    resolvePrincipal: mock(
      async (actor: ActorRef): Promise<CallerPrincipal | null> => {
        if (actor.kind !== "user") return null;
        const level = principals[actor.userId];
        return level ? { userId: actor.userId, permissionLevel: level } : null;
      },
    ),
  });
  // Creating and updating an entry takes trusted; deleting one, admin.
  const permissions = new PermissionService(
    {},
    {
      entityActionFloor: (entityType): EntityActionPolicyRule | undefined =>
        entityType === entry.type
          ? { create: "trusted", update: "trusted", delete: "admin" }
          : undefined,
    },
  );
  shell.getPermissionService = (): PermissionService => permissions;
  for (const plugin of plugins) await plugin.register(shell);
  const entryPlugin = plugins.find(({ id }) => id.endsWith(":ledger-entry"));
  if (!entryPlugin) throw new Error("No ledger entry plugin");
  return { shell, service, pluginId: entryPlugin.id };
}

function handler(shell: MockShell, type: string): JobHandler {
  const found = shell.getJobQueueService().getHandler(type);
  if (!found) throw new Error(`No handler for ${type}`);
  return found;
}

/** Runs the write job as the worker does, for a requester or the package. */
async function run(
  shell: MockShell,
  pluginId: string,
  input: z.input<typeof writeSchema>,
  as:
    | {
        readonly userId: string;
        readonly level: "admin" | "trusted" | "public";
      }
    | "package",
): Promise<unknown> {
  const job = handler(shell, `${packageName}:ledger-entry:write`);
  const data = job.validateAndParse(
    as === "package"
      ? {
          authority: {
            actor: { kind: "service", serviceId: pluginId },
            permissionCeiling: "public",
          },
          input,
          byPackage: true,
        }
      : {
          authority: {
            actor: { kind: "user", userId: as.userId },
            principalId: as.userId,
            permissionCeiling: as.level,
          },
          input,
        },
  );
  if (data === null) throw new Error("Invalid job data");
  return job.process(
    data,
    "job-1",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function seedEntry(
  service: EntityService,
  id: string,
  visibility: "public" | "shared" | "restricted",
): Promise<void> {
  await service.createEntity({
    entity: {
      id,
      entityType: entry.type,
      content: `A ${visibility} entry`,
      metadata: { title: id },
      visibility,
    },
  });
}

async function storedContent(
  service: EntityService,
  id: string,
): Promise<string | undefined> {
  return (
    await service.getEntity({
      entityType: entry.type,
      id,
      visibilityScope: "restricted",
    })
  )?.content;
}

const trusted = { userId: "usr_trusted", level: "trusted" } as const;
const visitor = { userId: "usr_public", level: "public" } as const;
const admin = { userId: "usr_admin", level: "admin" } as const;

describe("an entity job's writes", () => {
  it("creates its type's record as a requester the type's policy admits", async () => {
    const { shell, service, pluginId } = await install({
      usr_trusted: "trusted",
    });

    expect(
      await run(shell, pluginId, { op: "create", id: "first" }, trusted),
    ).toEqual({ done: { id: "first" } });
    expect(await storedContent(service, "first")).toBe("Written by the job");
  });

  it("refuses a requester the type's policy does not admit", async () => {
    const { shell, service, pluginId } = await install({
      usr_public: "public",
    });

    expect(
      await run(shell, pluginId, { op: "create", id: "first" }, visitor),
    ).toEqual({ refused: expect.stringContaining("requires trusted") });
    expect(await storedContent(service, "first")).toBeUndefined();
  });

  it("refuses a requester a visibility they may not write", async () => {
    const { shell, service, pluginId } = await install({
      usr_trusted: "trusted",
    });

    expect(
      await run(
        shell,
        pluginId,
        { op: "create", id: "secret", visibility: "restricted" },
        trusted,
      ),
    ).toEqual({ refused: expect.stringContaining("restricted") });
    expect(await storedContent(service, "secret")).toBeUndefined();
  });

  it("writes as the package past the policy when the package queued the job", async () => {
    const { shell, service, pluginId } = await install({});
    await seedEntry(service, "kept", "restricted");

    expect(
      await run(shell, pluginId, { op: "delete", id: "kept" }, "package"),
    ).toEqual({ done: undefined });
    expect(await storedContent(service, "kept")).toBeUndefined();
  });

  it("refuses another type, even one its package declares", async () => {
    const { shell, pluginId } = await install({ usr_admin: "admin" });

    expect(await run(shell, pluginId, { op: "create-sibling" }, admin)).toEqual(
      {
        refused: expect.stringContaining('"ledger-note"'),
      },
    );
  });

  it("refuses an id taken at a visibility the requester cannot see", async () => {
    const { shell, service, pluginId } = await install({
      usr_trusted: "trusted",
    });
    await seedEntry(service, "taken", "restricted");

    expect(
      await run(shell, pluginId, { op: "create", id: "taken" }, trusted),
    ).toEqual({ refused: expect.stringContaining("already exists") });
    expect(await storedContent(service, "taken")).toBe("A restricted entry");
  });

  it("updates a record as read, and refuses one that changed after", async () => {
    const { shell, service, pluginId } = await install({
      usr_trusted: "trusted",
    });
    await seedEntry(service, "open", "public");

    expect(
      await run(
        shell,
        pluginId,
        { op: "update", id: "open", stale: true },
        trusted,
      ),
    ).toEqual({
      refused: expect.stringContaining("changed after it was read"),
    });
    expect(
      await run(
        shell,
        pluginId,
        { op: "update", id: "open", stale: false },
        trusted,
      ),
    ).toEqual({ done: undefined });
    expect(await storedContent(service, "open")).toBe("Updated by the job");
  });

  it("reads and writes nothing its requester cannot see", async () => {
    const { shell, service, pluginId } = await install({
      usr_trusted: "trusted",
    });
    await seedEntry(service, "hidden", "restricted");

    expect(
      await run(
        shell,
        pluginId,
        { op: "update", id: "hidden", stale: false },
        trusted,
      ),
    ).toEqual({ refused: "not visible" });
    expect(await storedContent(service, "hidden")).toBe("A restricted entry");
  });
});

describe("a generation's context", () => {
  it("reads only: the runtime persists what a generation returns", async () => {
    const { shell } = await install({ usr_admin: "admin" });
    const job = handler(shell, "ledger-entry:generation");
    const data = job.validateAndParse({
      authority: {
        actor: { kind: "user", userId: "usr_admin" },
        principalId: "usr_admin",
        permissionCeiling: "admin",
      },
      input: { prompt: "Write" },
    });
    if (data === null) throw new Error("Invalid generation data");

    await job.process(
      data,
      "job-2",
      createMockProgressReporter(),
      new AbortController().signal,
    );

    expect(generationWriter).toEqual(["count", "get", "list"]);
  });
});
