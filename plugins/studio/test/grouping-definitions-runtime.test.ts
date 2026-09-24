import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { noteAdapter, noteSchema } from "@brains/note";
import { blogPostAdapter, blogPostSchema } from "@brains/blog";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import {
  PermissionService,
  type EntityActionPolicyRule,
} from "@brains/templates";
import { registerGroupingDefinitions } from "../src/grouping-definitions";
import type { GroupingDefinitionSource } from "../src/grouping-definition-source";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

const type = "grouping-definitions";
const areas = { label: "Areas", types: ["note", "post"], multiple: true };
interface Fixture {
  service: EntityService;
  registry: EntityRegistry;
  source: GroupingDefinitionSource;
  request(
    method: string,
    path: string,
    body?: unknown,
    role?: "admin" | "trusted",
  ): Promise<Response>;
}
const services: EntityService[] = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const service of services.splice(0)) service.close();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function directory(): Promise<string> {
  const temporary = await createTestDirectory();
  cleanups.push(temporary.cleanup);
  return temporary.dir;
}
async function open(dir: string): Promise<Fixture> {
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("note", noteSchema, noteAdapter);
  registry.registerEntityType("post", blogPostSchema, blogPostAdapter);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      dimensions: 1536,
      generateEmbedding: async () => {
        throw new Error("Unexpected embedding");
      },
      generateEmbeddings: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  services.push(service);
  await service.initialize();
  const shell = createMockShell({ entityService: service });
  spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
  spyOn(shell, "getPermissionService").mockReturnValue(
    new PermissionService(
      {
        entityActions: {
          "*": { create: "trusted", update: "trusted", delete: "trusted" },
        },
      },
      {
        entityActionFloor: (name): EntityActionPolicyRule | undefined =>
          registry.getEntityTypeConfig(name).actionPolicy,
      },
    ),
  );
  const context = createServicePluginContext(shell, "studio");
  const source = registerGroupingDefinitions(context);
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
    resolveAuthPrincipal: async (request) => {
      const role =
        request.headers.get("X-Fixture-Role") === "trusted"
          ? "trusted"
          : "admin";
      return {
        userId: role,
        personId: role,
        displayName: role,
        role,
        permissionLevel: role,
        status: "active",
        isAnchor: false,
      };
    },
  });
  await service.reprojectRegisteredGroupings();
  return {
    service,
    registry,
    source,
    request: async (method, path, body, role = "admin"): Promise<Response> => {
      const route = routes.find(
        (entry) =>
          entry.method === method &&
          entry.path === `/studio/api/${path.split("?")[0]}`,
      );
      if (!route) throw new Error("Missing test route");
      return route.handler(
        new Request(`https://studio.test/studio/api/${path}`, {
          method,
          headers: {
            "X-Fixture-Role": role,
            "Content-Type": "application/json",
            Origin: "https://studio.test",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    },
  };
}
async function save(
  fixture: Fixture,
  groupings: unknown,
  method = "POST",
): Promise<Response> {
  return fixture.request(method, "entities", {
    entityType: type,
    id: type,
    frontmatter: { visibility: "shared", groupings },
  });
}
function content(values: string[], entityType = "note"): string {
  return `---\ntitle: Member\n${entityType === "post" ? "status: draft\nslug: member\nexcerpt: Example\nauthor: Tester\n" : ""}areas: ${JSON.stringify(values)}\n---\n\nBody`;
}

describe("document-backed runtime definitions with real adapters", () => {
  test("a saved definition reaches schemas, writes and catalogs in another process without registration or restart", async () => {
    const dir = await directory();
    const writer = await open(dir);
    const reader = await open(dir);
    expect(
      await (await reader.request("GET", "schema?type=note")).json(),
    ).toMatchObject({ format: "raw" });
    expect((await save(writer, { areas })).status).toBe(201);
    expect(
      await (await reader.request("GET", "schema?type=note")).json(),
    ).toMatchObject({
      format: "frontmatter",
      fields: expect.arrayContaining([
        expect.objectContaining({ name: "areas" }),
      ]),
    });
    const created = await reader.request("POST", "entities", {
      entityType: "note",
      idPath: ["member"],
      frontmatter: { title: "Member", areas: ["Field notes"] },
      body: "Body",
    });
    expect(created.status).toBe(201);
    expect(
      await writer.service.queryGroupingCatalog({
        grouping: "areas",
        entityTypes: ["note"],
      }),
    ).toMatchObject({ values: [{ value: "Field notes", count: 1 }], total: 1 });
    const before = await reader.service.getEntity({
      entityType: "note",
      id: "member",
    });
    await writer.service.deleteEntity({ entityType: type, id: type });
    expect(await (await reader.request("GET", "types")).json()).toMatchObject({
      groupings: [],
    });
    expect(
      await (await reader.request("GET", "schema?type=note")).json(),
    ).toMatchObject({ format: "raw" });
    const after = await reader.service.getEntity({
      entityType: "note",
      id: "member",
    });
    expect(after).toEqual(before);
  });

  test("loads raw definitions without resolving image-like literal values", async () => {
    const dir = await directory();
    const writer = await open(dir);
    const reader = await open(dir);
    const values = ["![Literal](entity://image/not-a-reference)"];
    expect((await save(writer, { areas: { ...areas, values } })).status).toBe(
      201,
    );
    const resolvedRead = spyOn(reader.service, "getEntity").mockRejectedValue(
      new Error("Definitions must not resolve content"),
    );
    await reader.source.ensureCurrent();
    expect(resolvedRead).not.toHaveBeenCalled();
    expect(reader.source.getSnapshot().groupings["areas"]?.values).toEqual(
      values,
    );
  });

  test("Studio creation refreshes its format before preparing the first note", async () => {
    const dir = await directory();
    const writer = await open(dir);
    const reader = await open(dir);
    expect((await save(writer, { areas })).status).toBe(201);
    const created = await reader.request("POST", "entities", {
      entityType: "note",
      idPath: ["fresh"],
      frontmatter: { title: "Fresh", areas: ["New area"] },
      body: "Body",
    });
    expect(created.status).toBe(201);
    expect(
      (
        await reader.service.queryGroupingCatalog({
          grouping: "areas",
          entityTypes: ["note"],
        })
      ).values,
    ).toEqual([{ value: "New area", count: 1 }]);
  });

  test("startup loads definitions before reprojecting existing source without new exports", async () => {
    const dir = await directory();
    const writer = await open(dir);
    await writer.service.createEntityFromMarkdown({
      input: {
        entityType: "note",
        id: "existing",
        markdown: content(["Before definition"]),
      },
    });
    const before = await writer.service.getEntity({
      entityType: "note",
      id: "existing",
    });
    expect((await save(writer, { areas })).status).toBe(201);
    const exports = await writer.service.listPendingEntityExports();
    const restarted = await open(dir);
    expect(restarted.service.areGroupingsReady()).toBe(true);
    expect(
      (
        await restarted.service.queryGroupingCatalog({
          grouping: "areas",
          entityTypes: ["note"],
        })
      ).values,
    ).toEqual([{ value: "Before definition", count: 1 }]);
    expect(
      await restarted.service.getEntity({ entityType: "note", id: "existing" }),
    ).toEqual(before);
    expect(await restarted.service.listPendingEntityExports()).toEqual(exports);
  });

  test.each(["note", "post"])(
    "direct %s writers observe cardinality and lists even before any schema request",
    async (entityType) => {
      const dir = await directory();
      const writer = await open(dir);
      const worker = await open(dir);
      expect(
        (await save(writer, { areas: { ...areas, multiple: false } })).status,
      ).toBe(201);
      const refused = await worker.service
        .createEntityFromMarkdown({
          input: {
            entityType,
            id: "refused",
            markdown: content(["A", "B"], entityType),
          },
        })
        .catch((error: unknown) => error);
      expect(refused).toMatchObject({
        name: "EntityValidationError",
        phase: "persist",
        originalError: {
          issues: expect.arrayContaining([
            expect.objectContaining({ path: ["areas"] }),
          ]),
        },
      });
      await worker.service.createEntityFromMarkdown({
        input: {
          entityType,
          id: "member",
          markdown: content(["A"], entityType),
        },
      });
      const stored = await worker.service.getEntity({
        entityType,
        id: "member",
      });
      if (!stored) throw new Error("Missing member");
      expect(
        (
          await worker.service.queryGroupingCatalog({
            grouping: "areas",
            entityTypes: [entityType],
          })
        ).values,
      ).toEqual([{ value: "A", count: 1 }]);
      expect(
        (
          await save(
            writer,
            { areas: { ...areas, multiple: true, values: ["B"] } },
            "PUT",
          )
        ).status,
      ).toBe(200);
      expect(
        (await worker.service.getEntity({ entityType, id: "member" }))?.content,
      ).toBe(stored.content);
      const failure = await worker.service
        .updateEntity({
          entity: { ...stored, content: `${stored.content}\nChange` },
        })
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({
        name: "EntityValidationError",
        phase: "persist",
      });
      const upsert = await worker.service
        .upsertEntity({
          entity: {
            ...stored,
            id: "upserted",
            content: content(["A"], entityType),
          },
        })
        .catch((error: unknown) => error);
      expect(upsert).toMatchObject({
        name: "EntityValidationError",
        phase: "persist",
      });
      expect((await save(writer, { areas }, "PUT")).status).toBe(200);
      await worker.service.updateEntity({
        entity: { ...stored, content: content(["A", "B"], entityType) },
      });
      expect(
        (
          await worker.service.queryGroupingCatalog({
            grouping: "areas",
            entityTypes: [entityType],
          })
        ).values,
      ).toEqual([
        { value: "A", count: 1 },
        { value: "B", count: 1 },
      ]);
    },
  );

  test("refreshes before Markdown projection so removed fields become unclaimed immediately", async () => {
    const dir = await directory();
    const writer = await open(dir);
    expect((await save(writer, { areas })).status).toBe(201);
    const worker = await open(dir);
    await writer.service.deleteEntity({ entityType: type, id: type });
    const reads = spyOn(worker.service, "getEntityRaw");
    const markdown =
      "---\ntitle: Unclaimed\nareas: literal, not a list\n---\n\nBody";
    await worker.service.createEntityFromMarkdown({
      input: { entityType: "note", id: "unclaimed", markdown },
    });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(worker.registry.getGroupings()).toEqual([]);
    const saved = await worker.service.getEntity({
      entityType: "note",
      id: "unclaimed",
    });
    if (!saved) throw new Error("Missing note");
    expect(parseMarkdown(saved.content).frontmatter["areas"]).toBe(
      "literal, not a list",
    );
  });

  test("refuses invalid definitions at the section path and keeps the previous active set", async () => {
    const fixture = await open(await directory());
    expect((await save(fixture, { areas })).status).toBe(201);
    await fixture.registry.ensureGroupingsCurrent();
    const invalid = await save(
      fixture,
      { areas, broken: { ...areas, types: ["unknown"] } },
      "PUT",
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["groupings", "broken"] }),
      ]),
    });
    expect(fixture.source.getSnapshot().groupings).toEqual({ areas });
    const denied = await fixture.request(
      "PUT",
      "entities",
      {
        entityType: type,
        id: type,
        frontmatter: { visibility: "shared", groupings: {} },
      },
      "trusted",
    );
    expect(denied.status).toBe(403);
    expect(
      (
        await fixture.request(
          "GET",
          `entities?type=${type}&id=${type}`,
          undefined,
          "trusted",
        )
      ).status,
    ).toBe(200);
  });

  test("projection transactions refresh definitions without nested reprojection and roll back refused output", async () => {
    const dir = await directory();
    const writer = await open(dir);
    const worker = await open(dir);
    const reprojection = spyOn(worker.service, "reprojectRegisteredGroupings");
    expect(
      (
        await save(writer, {
          areas: { ...areas, multiple: false, values: ["A"] },
        })
      ).status,
    ).toBe(201);
    const store = worker.service.getProjectionStore();
    await store.markDirty({
      sourceType: "note",
      sourceId: "source",
      revision: "one",
      operation: "upsert",
      markedAt: Date.now(),
    });
    await store.claimPendingWave({
      waveId: "wave",
      graphFingerprint: "test",
      startedAt: Date.now(),
    });
    await store.putWaveRules("wave", [
      { ruleId: "rule", targetType: "note", level: 0 },
    ]);
    const writeIntents: ProjectionWriteIntent[] = ["A", "B"].map((value) => ({
      operation: "upsert",
      entity: {
        id: value,
        entityType: "note",
        content: content([value]),
        visibility: "shared",
        metadata: { title: "Member", areas: ["A"] },
      },
    }));
    const input = {
      waveId: "wave",
      ruleId: "rule",
      ruleVersion: "1",
      inputFingerprint: "one",
      completedAt: Date.now(),
      writeIntents,
    };
    const failure = await store
      .applyRuleResult(input)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      name: "EntityValidationError",
      phase: "persist",
    });
    expect(
      await worker.service.getEntity({
        entityType: "note",
        id: "A",
        visibilityScope: "shared",
      }),
    ).toBeNull();
    expect(
      await store.isProjectionOwnedEntity({ entityType: "note", id: "A" }),
    ).toBe(false);
    expect(reprojection).not.toHaveBeenCalled();
    expect(
      (await save(writer, { areas: { ...areas, values: ["A", "B"] } }, "PUT"))
        .status,
    ).toBe(200);
    expect(await store.applyRuleResult(input)).toMatchObject({
      status: "completed",
    });
    expect(
      (
        await worker.service.queryGroupingCatalog({
          grouping: "areas",
          entityTypes: ["note"],
          visibilityScope: "shared",
        })
      ).total,
    ).toBe(2);
  });
});
