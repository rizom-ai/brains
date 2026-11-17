import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { baseEntitySchema, createTestEntityAdapter } from "../test";
import { probeRuntime } from "../src/test/probe-service-runtime";

/**
 * A first-party service other than Studio reads the brain's groupings as
 * the action board's class read them through context.entities and
 * context.entityService: the definitions current, a grouping's catalog and
 * a value's members at the scope each read names. It writes no definition,
 * source or validator; those stay Studio's.
 */

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** A brain's entity store with a projects grouping over cards. */
async function storeWithCards(): Promise<MockShell> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType(
    "card",
    baseEntitySchema,
    createTestEntityAdapter("card"),
  );
  registry.registerGrouping({
    key: "projects",
    field: "projects",
    label: "Projects",
    types: ["card"],
  });
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const shell = createMockShell();
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: shell.getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  closers.push(async () => {
    service.close();
    await directory.cleanup();
  });
  spyOn(shell, "getEntityService").mockReturnValue(service);
  spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
  for (const [id, visibility] of [
    ["open", "public"],
    ["team", "shared"],
    ["private", "restricted"],
  ] as const) {
    await service.createEntity({
      entity: {
        id,
        entityType: "card",
        visibility,
        content: generateMarkdown({ projects: ["Fair"] }, `Card ${id}\n`),
        metadata: {},
      },
    });
  }
  await service.createEntity({
    entity: {
      id: "retreat",
      entityType: "card",
      visibility: "shared",
      content: generateMarkdown({ projects: ["Retreat"] }, "Card retreat\n"),
      metadata: {},
    },
  });
  return shell;
}

describe("a first-party service reading the brain's groupings as the action board's class did", () => {
  it("reads the definitions, any service, while groupings() stays Studio's", async () => {
    const shell = await storeWithCards();
    const runtime = await probeRuntime(shell);
    expect(
      runtime.groupingReads
        .getGroupings()
        .map(({ key, types }) => [key, types]),
    ).toEqual([["projects", ["card"]]]);
    expect(() => runtime.groupings()).toThrow(
      `Service "probe" cannot reach the brain's groupings: Studio owns them`,
    );
    expect(Object.keys(runtime.groupingReads).sort()).toEqual([
      "ensureGroupingsCurrent",
      "getGroupings",
      "queryGroupingCatalog",
      "queryGroupingMembers",
    ]);
  });

  it("brings the definitions current as the class's call did: through the grouping source, which may reproject", async () => {
    const shell = createMockShell();
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType(
      "grouping-definitions",
      baseEntitySchema,
      createTestEntityAdapter("grouping-definitions"),
    );
    spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
    const calls: unknown[] = [];
    // The source is Studio's: refreshing may replace the definitions and
    // mark existing records for grouping reprojection, as any read does.
    registry.registerGroupingSource({
      entityType: "grouping-definitions",
      ensureCurrent: async (options) => {
        calls.push(options);
      },
    });
    const runtime = await probeRuntime(shell);
    await runtime.groupingReads.ensureGroupingsCurrent();
    expect(calls).toEqual([undefined]);
  });

  it("reads a grouping's catalog and a value's members at the scope the read names", async () => {
    const runtime = await probeRuntime(await storeWithCards());
    const reads = runtime.groupingReads;
    const catalog = async (
      visibilityScope: "public" | "shared" | "restricted",
    ): Promise<[string, number][]> =>
      (
        await reads.queryGroupingCatalog({
          grouping: "projects",
          entityTypes: ["card"],
          visibilityScope,
          limit: 100,
        })
      ).values.map(({ value, count }) => [value, count]);
    const members = async (
      visibilityScope: "public" | "shared" | "restricted",
    ): Promise<string[]> =>
      (
        await reads.queryGroupingMembers({
          grouping: "projects",
          value: "Fair",
          entityTypes: ["card"],
          visibilityScope,
          limit: 100,
          offset: 0,
          sort: "updated-desc",
        })
      ).entities
        .map(({ id }) => id)
        .sort();

    expect(await catalog("public")).toEqual([["Fair", 1]]);
    expect(await members("public")).toEqual(["open"]);
    expect(await catalog("shared")).toEqual([
      ["Fair", 2],
      ["Retreat", 1],
    ]);
    expect(await members("shared")).toEqual(["open", "team"]);
    expect(await members("restricted")).toEqual(["open", "private", "team"]);
  });
});
