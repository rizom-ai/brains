import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { PermissionService } from "@brains/templates";
import { studioPlugin } from "@brains/studio";
import { DirectorySync, type ImportResult } from "@brains/directory-sync";
import { AuthServicePlugin } from "@brains/auth-service";
import { z } from "@brains/utils/zod";

const editorEntitySchema = z.object({
  entity: z.object({
    frontmatter: z.record(z.string(), z.unknown()),
    body: z.string(),
    contentHash: z.string(),
  }),
});
import { readFile, writeFile } from "node:fs/promises";
import {
  EntityRegistry,
  EntityService,
  ProjectionJsonObjectSchema,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { noteAdapter, noteSchema } from "@brains/note";
import { blogPostAdapter, blogPostSchema } from "@brains/blog";
import { createMockShell } from "@brains/plugins/test";
import {
  createSilentLogger,
  createTestDirectory,
  createMockProgressReporter,
} from "@brains/test-utils";

const clients = {
  key: "clients",
  label: "Clients",
  field: "clients",
  types: ["note", "post"],
};
const query = { grouping: "clients", entityTypes: ["note", "post"] };

describe("Clients through the real Note and BlogPost adapters", () => {
  const services: EntityService[] = [];
  const registries = new Map<EntityService, EntityRegistry>();
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const service of services.splice(0)) service.close();
    registries.clear();
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });
  async function open(
    directory: string,
    enabled: boolean,
  ): Promise<EntityService> {
    const dbConfig = { url: `file:${directory}/entities.db` };
    await migrateEntities(dbConfig, createSilentLogger());
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType("note", noteSchema, noteAdapter);
    registry.registerEntityType("post", blogPostSchema, blogPostAdapter);
    if (enabled) registry.registerGrouping(clients);
    const service = EntityService.createFresh({
      dbConfig,
      embeddingDbConfig: { url: `file:${directory}/embeddings.db` },
      entityRegistry: registry,
      logger: createSilentLogger(),
      jobQueueService: createMockShell().getJobQueueService(),
      embeddingsEnabled: false,
      embeddingService: {
        dimensions: 1536,
        generateEmbedding: async () => {
          throw new Error("Unexpected embedding request");
        },
        generateEmbeddings: async () => {
          throw new Error("Unexpected embedding request");
        },
      },
    });
    registries.set(service, registry);
    services.push(service);
    await service.initialize();
    return service;
  }
  async function editor(
    service: EntityService,
    adminWrites = false,
    onSession?: (
      auth: AuthServicePlugin,
      role: "admin" | "trusted" | "public",
      userId: string,
    ) => void,
  ): Promise<
    (
      method: string,
      path: string,
      body?: unknown,
      role?: "admin" | "trusted" | "public" | null,
    ) => Promise<Response>
  > {
    const shell = createMockShell({ entityService: service });
    const registry = registries.get(service);
    if (!registry) throw new Error("Missing registry");
    spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
    spyOn(shell, "getPermissionService").mockReturnValue(
      new PermissionService({
        entityActions: {
          "grouping-vocabulary": {
            create: "admin",
            update: "admin",
            delete: "admin",
            publish: "never",
          },
          "*": {
            create: adminWrites ? "admin" : "trusted",
            update: adminWrites ? "admin" : "trusted",
            delete: adminWrites ? "admin" : "trusted",
            extract: "never",
            publish: "admin",
          },
        },
      }),
    );
    const authDirectory = await createTestDirectory();
    const auth = new AuthServicePlugin({ storageDir: authDirectory.dir });
    await auth.register(shell);
    cleanups.push(async (): Promise<void> => {
      await auth.shutdown();
      await authDirectory.cleanup();
    });
    const sessions = new Map<string, string>();
    for (const role of ["admin", "trusted", "public"] as const) {
      const user = await auth
        .getService()
        .createUser({ displayName: `${role} editor`, role });
      const session = await auth.getService().createAuthSession(user.userId);
      sessions.set(role, session.cookie);
      onSession?.(auth, role, user.userId);
    }
    const plugin = studioPlugin();
    await plugin.register(shell);
    await plugin.finalizeRegistration();
    const routes = plugin.getWebRoutes();
    return async (method, path, body, role = "trusted"): Promise<Response> => {
      const route = routes.find(
        (entry) =>
          entry.method === method &&
          entry.path === `/studio/api/${path.split("?")[0]}`,
      );
      if (!route) throw new Error(`Missing route ${path}`);
      return route.handler(
        new Request(`https://studio.test/studio/api/${path}`, {
          method,
          headers: {
            Cookie: role === null ? "" : (sessions.get(role) ?? ""),
            "Content-Type": "application/json",
            Origin: "https://studio.test",
          },
          ...(body !== undefined && { body: JSON.stringify(body) }),
        }),
      );
    };
  }
  test.each(["role", "suspension", "revocation"] as const)(
    "an existing session loses grouping access after %s without changing its cookie",
    async (change) => {
      const directory = await createTestDirectory();
      cleanups.push(directory.cleanup);
      const service = await open(directory.dir, true);
      const content =
        "---\ntitle: Private brief\nclients: [Acme]\nvisibility: shared\n---\n\nBody";
      const parsed = service.deserializeEntity(content, "note");
      await service.createEntity({
        entity: {
          ...parsed,
          metadata: parsed.metadata ?? {},
          content,
          entityType: "note",
          id: "session-member",
        },
      });
      await service.reprojectRegisteredGroupings();
      const controls: Array<() => Promise<void>> = [];
      const request = await editor(
        service,
        false,
        (auth, role, userId): void => {
          if (role !== "trusted") return;
          controls.push(async (): Promise<void> => {
            if (change === "role")
              await auth.getService().updateUserRole(userId, "public");
            else if (change === "suspension")
              await auth.getService().suspendUser(userId);
            else
              await auth
                .getService()
                .revokeUserSessionsAndRefreshTokens(userId);
          });
        },
      );
      const catalog = "groups/catalog?grouping=clients";
      expect(await (await request("GET", catalog)).json()).toMatchObject({
        values: [{ value: "Acme", count: 1 }],
        total: 1,
      });
      const revoke = controls[0];
      if (!revoke) throw new Error("Missing session mutation fixture");
      await revoke();
      for (const path of [
        "types",
        catalog,
        "groups/members?grouping=clients&value=Acme",
      ])
        expect((await request("GET", path)).status).toBe(401);
      expect(
        (
          await request("DELETE", "entities?type=note&id=session-member", {
            confirmed: true,
          })
        ).status,
      ).toBe(401);
      expect(
        await service.getEntity({
          entityType: "note",
          id: "session-member",
          visibilityScope: "restricted",
        }),
      ).not.toBeNull();
    },
  );
  test("session switches scope descriptors, values, counts and deep links; deletion removes only the selected identity", async () => {
    const directory = await createTestDirectory();
    cleanups.push(directory.cleanup);
    const service = await open(directory.dir, true);
    for (const entityType of ["note", "post"]) {
      const content = `---\ntitle: ${entityType}\n${entityType === "post" ? "status: draft\nslug: secret\nexcerpt: Secret\nauthor: Tester\nvisibility: restricted\n" : ""}clients: [${entityType === "post" ? "Hidden client" : "Visible client"}]\n---\n\nBody`;
      const parsed = service.deserializeEntity(content, entityType);
      await service.createEntity({
        entity: {
          ...parsed,
          metadata: parsed.metadata ?? {},
          content,
          entityType,
          id: "same",
        },
      });
    }
    await service.reprojectRegisteredGroupings();
    const request = await editor(service, true);
    const catalog = "groups/catalog?grouping=clients";
    expect(
      await (await request("GET", catalog, undefined, "admin")).json(),
    ).toMatchObject({
      values: [
        { value: "Hidden client", count: 1 },
        { value: "Visible client", count: 1 },
      ],
      total: 2,
    });
    expect(
      await (await request("GET", catalog, undefined, "trusted")).json(),
    ).toEqual({
      grouping: { ...clients, types: ["note"] },
      values: [{ value: "Visible client", count: 1 }],
      total: 1,
    });
    expect(
      await (await request("GET", "types", undefined, "trusted")).json(),
    ).toMatchObject({ groupings: [{ ...clients, types: ["note"] }] });
    for (const value of ["Hidden client", "Unknown client"]) {
      expect(
        await (
          await request(
            "GET",
            `groups/members?grouping=clients&value=${encodeURIComponent(value)}`,
            undefined,
            "trusted",
          )
        ).json(),
      ).toEqual({
        grouping: { ...clients, types: ["note"] },
        entities: [],
        total: 0,
      });
    }
    for (const role of ["public", null] as const)
      expect((await request("GET", catalog, undefined, role)).status).toBe(
        role === null ? 401 : 403,
      );
    expect(
      (
        await request(
          "DELETE",
          "entities?type=post&id=same",
          { confirmed: true },
          "trusted",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          "DELETE",
          "entities?type=post&id=same",
          { confirmed: true },
          "admin",
        )
      ).status,
    ).toBe(200);
    expect(
      await (await request("GET", catalog, undefined, "admin")).json(),
    ).toEqual({
      grouping: clients,
      values: [{ value: "Visible client", count: 1 }],
      total: 1,
    });
    expect(
      await service.getEntity({ entityType: "note", id: "same" }),
    ).not.toBeNull();
  });
  test.each(["note", "post"])(
    "closed vocabularies govern real %s writes without rewriting old content",
    async (entityType) => {
      const directory = await createTestDirectory();
      cleanups.push(directory.cleanup);
      const service = await open(directory.dir, true);
      const request = await editor(service);
      const frontmatter = {
        title: "Example",
        clients: ["Gamma"],
        ...(entityType === "post" && {
          status: "draft",
          slug: "example",
          excerpt: "Example",
          author: "Tester",
        }),
      };
      expect(
        (
          await request("POST", "entities", {
            entityType,
            idPath: ["old"],
            frontmatter,
            body: "Body",
          })
        ).status,
      ).toBe(201);
      const original = await service.getEntity({ entityType, id: "old" });
      if (!original) throw new Error("Missing original");
      const vocabulary = {
        groupings: { clients: { multiple: true, values: ["Acme", "Beta"] } },
        visibility: "shared",
      };
      expect(
        (
          await request(
            "POST",
            "entities",
            { entityType: "grouping-vocabulary", frontmatter: vocabulary },
            "trusted",
          )
        ).status,
      ).toBe(403);
      const created = await request(
        "POST",
        "entities",
        { entityType: "grouping-vocabulary", frontmatter: vocabulary },
        "admin",
      );
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({
        entityId: "grouping-vocabulary",
      });
      expect(await (await request("GET", "types")).json()).toMatchObject({
        groupings: [{ ...clients, vocabulary: vocabulary.groupings.clients }],
      });
      expect(await service.getEntity({ entityType, id: "old" })).toEqual(
        original,
      );
      await service.reprojectRegisteredGroupings();
      expect((await service.queryGroupingCatalog(query)).values).toEqual([
        { value: "Gamma", count: 1 },
      ]);
      expect(
        (
          await request(
            "GET",
            "entities?type=grouping-vocabulary&id=grouping-vocabulary",
            undefined,
            "public",
          )
        ).status,
      ).toBe(403);
      expect(await (await request("GET", "types")).json()).toMatchObject({
        types: expect.arrayContaining([
          expect.objectContaining({
            entityType: "grouping-vocabulary",
            isSingleton: true,
            capabilities: expect.objectContaining({
              canRead: true,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
              canPublish: false,
            }),
          }),
        ]),
      });
      const deniedUpdate = await request("PUT", "entities", {
        entityType,
        id: "old",
        frontmatter,
        body: "Changed",
      });
      expect(deniedUpdate.status).toBe(400);
      expect(await deniedUpdate.json()).toMatchObject({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["clients"] }),
        ]),
      });
      const deniedCreate = await request("POST", "entities", {
        entityType,
        idPath: ["new"],
        frontmatter,
        body: "Body",
      });
      expect(deniedCreate.status).toBe(400);
      expect(await deniedCreate.json()).toMatchObject({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["clients"] }),
        ]),
      });
      const persistError = await service
        .updateEntity({
          entity: { ...original, content: original.content + "\nChanged" },
        })
        .catch((cause: unknown) => cause);
      expect(persistError).toMatchObject({
        message: expect.stringContaining("Clients"),
      });
      expect(await service.getEntity({ entityType, id: "old" })).toEqual(
        original,
      );
      expect(
        (
          await request("PUT", "entities", {
            entityType,
            id: "old",
            frontmatter: { ...frontmatter, clients: ["Acme", "Beta"] },
            body: "Changed",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            "PUT",
            "entities",
            {
              entityType: "grouping-vocabulary",
              id: "grouping-vocabulary",
              frontmatter: vocabulary,
            },
            "trusted",
          )
        ).status,
      ).toBe(403);
      const beforeCardinality = await service.getEntity({
        entityType,
        id: "old",
      });
      const single = {
        groupings: { clients: { multiple: false, values: ["Acme", "Beta"] } },
      };
      // A list the constrained editors cannot read would refuse their saves
      // while showing them nothing to choose from, so it is refused outright.
      const hidden = await request(
        "PUT",
        "entities",
        {
          entityType: "grouping-vocabulary",
          id: "grouping-vocabulary",
          frontmatter: { ...single, visibility: "restricted" },
        },
        "admin",
      );
      expect(hidden.status).toBe(400);
      expect(await hidden.json()).toMatchObject({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["visibility"] }),
        ]),
      });
      expect(
        (
          await request(
            "PUT",
            "entities",
            {
              entityType: "grouping-vocabulary",
              id: "grouping-vocabulary",
              frontmatter: { ...single, visibility: "shared" },
            },
            "admin",
          )
        ).status,
      ).toBe(200);
      expect(await service.getEntity({ entityType, id: "old" })).toEqual(
        beforeCardinality,
      );
      // The editors a vocabulary constrains can always read it.
      expect(await (await request("GET", "types")).json()).toMatchObject({
        groupings: [{ ...clients, vocabulary: single.groupings.clients }],
      });
      const cardinality = await request("PUT", "entities", {
        entityType,
        id: "old",
        frontmatter: { ...frontmatter, clients: ["Acme", "Beta"] },
        body: "Changed again",
      });
      expect(cardinality.status).toBe(400);
      expect(await cardinality.json()).toMatchObject({
        issues: [
          {
            path: ["clients"],
            message: expect.stringContaining("at most one"),
          },
        ],
      });
      expect(
        (
          await request("PUT", "entities", {
            entityType,
            id: "old",
            frontmatter: { ...frontmatter, clients: ["Acme"] },
            body: "One value",
          })
        ).status,
      ).toBe(200);
      const internalRefusal = await request("PUT", "entities", {
        entityType,
        id: "old",
        frontmatter,
        body: "Invalid",
      });
      expect(internalRefusal.status).toBe(400);
      expect(
        (
          await request(
            "PUT",
            "entities",
            {
              entityType: "grouping-vocabulary",
              id: "grouping-vocabulary",
              frontmatter: { groupings: {}, visibility: "shared" },
            },
            "admin",
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request("PUT", "entities", {
            entityType,
            id: "old",
            frontmatter,
            body: "Entry removed",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            "DELETE",
            "entities?type=grouping-vocabulary&id=grouping-vocabulary",
            { confirmed: true },
            "admin",
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request("PUT", "entities", {
            entityType,
            id: "old",
            frontmatter,
            body: "Reopened",
          })
        ).status,
      ).toBe(200);
    },
  );

  test("prototype-named grouping keys remain open until their own vocabulary exists", async () => {
    const directory = await createTestDirectory();
    cleanups.push(directory.cleanup);
    const service = await open(directory.dir, true);
    registries.get(service)?.registerGrouping({
      key: "constructor",
      field: "projects",
      label: "Projects",
      types: ["note"],
    });
    const request = await editor(service);
    const input = {
      entityType: "note",
      frontmatter: { title: "Project", projects: ["Other"] },
      body: "Body",
    };
    expect((await request("POST", "entities", input)).status).toBe(201);
    expect(
      JSON.stringify(await (await request("GET", "types")).json()),
    ).not.toContain('"vocabulary"');
    expect(
      (
        await request(
          "POST",
          "entities",
          {
            entityType: "grouping-vocabulary",
            frontmatter: {
              groupings: {
                constructor: { multiple: true, values: ["Launch"] },
              },
            },
          },
          "admin",
        )
      ).status,
    ).toBe(201);
    expect((await request("POST", "entities", input)).status).toBe(400);
  });

  test("a vocabulary hidden from editors cannot constrain them", async () => {
    const directory = await createTestDirectory();
    cleanups.push(directory.cleanup);
    const service = await open(directory.dir, true);
    const request = await editor(service);
    // Restricted would let an admin enforce a list trusted editors cannot read.
    const response = await request(
      "POST",
      "entities",
      {
        entityType: "grouping-vocabulary",
        frontmatter: {
          groupings: { clients: { multiple: true, values: ["Acme"] } },
          visibility: "restricted",
        },
      },
      "admin",
    );
    expect(response.status).toBe(400);
    expect(
      await service.getEntity({
        entityType: "grouping-vocabulary",
        id: "grouping-vocabulary",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });

  test("an unreadable vocabulary reopens its grouping instead of wedging saves", async () => {
    const directory = await createTestDirectory();
    cleanups.push(directory.cleanup);
    const service = await open(directory.dir, true);
    const request = await editor(service);
    expect(
      (
        await request(
          "POST",
          "entities",
          {
            entityType: "grouping-vocabulary",
            frontmatter: {
              groupings: { clients: { multiple: true, values: ["Acme"] } },
            },
          },
          "admin",
        )
      ).status,
    ).toBe(201);
    // Corrupt the stored row directly: every write path validates, so this
    // stands in for a hand-edited file or a schema change under stored data.
    const db = new Database(`${directory.dir}/entities.db`);
    db.run("UPDATE entities SET content = ? WHERE id = 'grouping-vocabulary'", [
      "---\ngroupings: 42\n---\n",
    ]);
    db.close();
    // A document that cannot be reconstructed reads as absent, so the grouping
    // reopens rather than refusing every membership write behind a document
    // only an administrator could repair.
    expect(
      (
        await request("POST", "entities", {
          entityType: "note",
          idPath: ["unlisted"],
          frontmatter: { title: "Brief", clients: ["Gamma"] },
          body: "Body",
        })
      ).status,
    ).toBe(201);
    expect(
      JSON.stringify(await (await request("GET", "types")).json()),
    ).not.toContain('"vocabulary"');
  });

  test("vocabulary saves reject undeclared keys, duplicate or empty values, and empty lists", async () => {
    const directory = await createTestDirectory();
    cleanups.push(directory.cleanup);
    const service = await open(directory.dir, true);
    const request = await editor(service);
    for (const groupings of [
      { typo: { multiple: true, values: ["Acme"] } },
      { clients: { multiple: true, values: ["Acme", "Acme"] } },
      { clients: { multiple: true, values: [""] } },
      { clients: { multiple: true, values: [] } },
    ]) {
      const response = await request(
        "POST",
        "entities",
        {
          entityType: "grouping-vocabulary",
          frontmatter: { groupings, visibility: "shared" },
        },
        "admin",
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        issues: expect.any(Array),
      });
    }
    expect(
      await service.getEntity({
        entityType: "grouping-vocabulary",
        id: "grouping-vocabulary",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });

  test("Studio enables multiple Properties on every participating Note and preserves fields across disable/re-enable", async () => {
    const directory = await createTestDirectory();
    cleanups.push(directory.cleanup);
    let service = await open(directory.dir, true);
    registries.get(service)?.registerGrouping({
      ...clients,
      key: "projects",
      label: "Projects",
      field: "projects",
    });
    let request = await editor(service);
    expect(
      await (await request("GET", "schema?type=note")).json(),
    ).toMatchObject({
      format: "frontmatter",
      fields: expect.arrayContaining([
        {
          name: "clients",
          label: "Clients",
          widget: "list",
          required: false,
          field: { name: "clients", label: "Clients", widget: "string" },
        },
        {
          name: "projects",
          label: "Projects",
          widget: "list",
          required: false,
          field: { name: "projects", label: "Projects", widget: "string" },
        },
      ]),
    });
    for (const entityType of ["note", "post"]) {
      const source = `---\ntitle: Example\n${entityType === "post" ? "status: draft\nslug: example\nexcerpt: Example\nauthor: Tester\n" : ""}clients: [Acme]\nprojects: [Launch]\nunclaimed: retained\nnullable: null\n---\n\n# Example\n\nBody`;
      const parsed = service.deserializeEntity(source, entityType);
      await service.createEntity({
        entity: {
          ...parsed,
          metadata: parsed.metadata ?? {},
          entityType,
          id: "entry",
          content: source,
        },
      });
      const response = await request(
        "GET",
        `entities?type=${entityType}&id=entry`,
      );
      const { entity } = editorEntitySchema.parse(await response.json());
      expect(entity.frontmatter["clients"]).toEqual(["Acme"]);
      expect(entity.body).not.toContain("clients:");
      const saved = await request("PUT", "entities", {
        entityType,
        id: "entry",
        frontmatter: {
          ...entity.frontmatter,
          clients: ["Beta", " Acme "],
          projects: ["Launch", "Website"],
          unclaimed: "ATTACK",
          injected: "NEW",
        },
        body: entity.body + "\nEdited",
        baseContentHash: entity.contentHash,
      });
      expect(saved.status).toBe(200);
      const stored = await service.getEntity({ entityType, id: "entry" });
      if (!stored) throw new Error("Missing saved entity");
      expect(stored.content).toContain("unclaimed: retained");
      expect(stored.content).toContain("nullable: null");
      expect(stored.content).not.toContain("ATTACK");
      expect(stored.content).not.toContain("injected:");
    }
    expect((await service.queryGroupingCatalog(query)).values).toEqual([
      { value: " Acme ", count: 2 },
      { value: "Beta", count: 2 },
    ]);
    expect(
      (await service.queryGroupingCatalog({ ...query, grouping: "projects" }))
        .values,
    ).toEqual([
      { value: "Launch", count: 2 },
      { value: "Website", count: 2 },
    ]);
    service.close();
    services.splice(services.indexOf(service), 1);
    service = await open(directory.dir, false);
    request = await editor(service);
    expect(
      await (await request("GET", "schema?type=note")).json(),
    ).toMatchObject({
      format: "raw",
      fields: [
        {
          name: "visibility",
          label: "Visibility",
          widget: "select",
          required: true,
          default: "public",
          options: expect.any(Array),
        },
      ],
    });
    for (const entityType of ["note", "post"]) {
      const { entity } = editorEntitySchema.parse(
        await (
          await request("GET", `entities?type=${entityType}&id=entry`)
        ).json(),
      );
      expect(
        (
          await request("PUT", "entities", {
            entityType,
            id: "entry",
            frontmatter:
              entityType === "note"
                ? entity.frontmatter
                : { ...entity.frontmatter, clients: ["ATTACK"] },
            body: entity.body + "\nDisabled edit",
          })
        ).status,
      ).toBe(200);
      const stored = await service.getEntity({ entityType, id: "entry" });
      if (!stored) throw new Error("Missing disabled entity");
      expect(service.serializeEntity(stored)).toContain("clients:");
      expect(stored.content).not.toContain("ATTACK");
      expect(stored.content).toContain("nullable: null");
    }
    service.close();
    services.splice(services.indexOf(service), 1);
    service = await open(directory.dir, true);
    await service.reprojectRegisteredGroupings();
    expect((await service.queryGroupingCatalog(query)).values).toEqual([
      { value: " Acme ", count: 2 },
      { value: "Beta", count: 2 },
    ]);
    request = await editor(service);
    const { entity } = editorEntitySchema.parse(
      await (await request("GET", "entities?type=note&id=entry")).json(),
    );
    delete entity.frontmatter["clients"];
    expect(
      (
        await request("PUT", "entities", {
          entityType: "note",
          id: "entry",
          frontmatter: entity.frontmatter,
          body: entity.body,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await service.queryGroupingMembers({ ...query, value: "Beta" })
      ).entities.map((entry) => entry.entityType),
    ).toEqual(["post"]);
    expect(
      (
        await request("POST", "entities", {
          entityType: "note",
          idPath: ["created"],
          frontmatter: { clients: ["New client"] },
          body: "# Created",
        })
      ).status,
    ).toBe(201);
    expect(
      (await service.queryGroupingMembers({ ...query, value: "New client" }))
        .total,
    ).toBe(1);
  });
  test.each(["note", "post"])(
    "projection writes enforce live vocabularies atomically for %s",
    async (entityType) => {
      const directory = await createTestDirectory();
      cleanups.push(directory.cleanup);
      const service = await open(directory.dir, true);
      const request = await editor(service);
      async function vocabulary(
        values: string[],
        method: "POST" | "PUT",
      ): Promise<void> {
        const response = await request(
          method,
          "entities",
          {
            entityType: "grouping-vocabulary",
            id: "grouping-vocabulary",
            frontmatter: {
              visibility: "shared",
              groupings: { clients: { multiple: false, values } },
            },
          },
          "admin",
        );
        expect(response.status).toBe(method === "POST" ? 201 : 200);
      }
      await vocabulary(["Acme"], "POST");
      const store = service.getProjectionStore();
      async function wave(waveId: string): Promise<void> {
        await store.markDirty({
          sourceType: "note",
          sourceId: "source",
          revision: waveId,
          operation: "upsert",
          markedAt: Date.now(),
        });
        await store.claimPendingWave({
          waveId,
          graphFingerprint: "test-graph",
          startedAt: Date.now(),
        });
        await store.putWaveRules(waveId, [
          { ruleId: "test-rule", targetType: entityType, level: 0 },
        ]);
      }
      function intent(id: string, values: string[]): ProjectionWriteIntent {
        const content = `---\ntitle: ${id}\n${entityType === "post" ? `status: draft\nslug: ${id}\nexcerpt: Projection\nauthor: Fixture\n` : ""}clients: ${JSON.stringify(values)}\n---\n\nBody`;
        const metadata: Record<string, unknown> = {
          ...service.deserializeEntity(content, entityType).metadata,
          clients: ["Acme"],
        };
        return {
          operation: "upsert",
          entity: {
            id,
            entityType,
            content,
            visibility: "shared",
            // Deliberately disagree with source: projection metadata is not
            // authority for grouping membership or vocabulary admission.
            metadata: ProjectionJsonObjectSchema.parse(
              Object.fromEntries(
                Object.entries(metadata).filter(
                  ([, value]) => value !== undefined,
                ),
              ),
            ),
          },
        };
      }
      await wave("vocabulary-wave");
      const input = {
        waveId: "vocabulary-wave",
        ruleId: "test-rule",
        ruleVersion: "1",
        inputFingerprint: "input-1",
        completedAt: Date.now(),
        writeIntents: [
          intent("projected-valid", ["Acme"]),
          intent("projected-stray", ["Gamma"]),
        ],
      };
      expect(
        await store.applyRuleResult(input).catch((error: unknown) => error),
      ).toMatchObject({
        name: "EntityValidationError",
        phase: "persist",
      });
      for (const id of ["projected-valid", "projected-stray"]) {
        expect(
          await service.getEntity({
            entityType,
            id,
            visibilityScope: "shared",
          }),
        ).toBeNull();
        expect(await store.isProjectionOwnedEntity({ entityType, id })).toBe(
          false,
        );
      }
      expect(
        await store.getRuleMemo({
          ruleId: input.ruleId,
          ruleVersion: input.ruleVersion,
          inputFingerprint: input.inputFingerprint,
        }),
      ).toBeNull();
      expect(
        (await service.listPendingEntityExports()).filter(
          (entry) => entry.entityType === entityType,
        ),
      ).toEqual([]);
      expect(await store.getWaveRule(input.waveId, input.ruleId)).toMatchObject(
        { status: "pending" },
      );
      await vocabulary(["Acme", "Gamma"], "PUT");
      expect(await store.applyRuleResult(input)).toMatchObject({
        status: "completed",
      });
      expect(
        (
          await service.queryGroupingCatalog({
            ...query,
            visibilityScope: "shared",
          })
        ).values,
      ).toEqual([
        { value: "Acme", count: 1 },
        { value: "Gamma", count: 1 },
      ]);
      const before = await service.getEntity({
        entityType,
        id: "projected-stray",
        visibilityScope: "shared",
      });
      expect(before).not.toBeNull();
      await vocabulary(["Acme"], "PUT");
      // Completed reports remain idempotent; they do not try to persist again.
      expect(await store.applyRuleResult(input)).toMatchObject({
        status: "completed",
      });
      await store.completeWave(input.waveId, Date.now());
      await wave("vocabulary-update");
      const update = {
        ...input,
        waveId: "vocabulary-update",
        inputFingerprint: "input-2",
        writeIntents: [intent("projected-stray", ["Gamma"])],
      };
      expect(
        await store.applyRuleResult(update).catch((error: unknown) => error),
      ).toMatchObject({
        phase: "persist",
      });
      expect(
        await service.getEntity({
          entityType,
          id: "projected-stray",
          visibilityScope: "shared",
        }),
      ).toEqual(before);
      await vocabulary(["Acme", "Gamma"], "PUT");
      expect(
        await store
          .applyRuleResult({
            ...update,
            writeIntents: [intent("projected-stray", ["Acme", "Gamma"])],
          })
          .catch((error: unknown) => error),
      ).toMatchObject({
        phase: "persist",
        message: expect.stringContaining("choose at most one value"),
      });
      expect(
        await service.getEntity({
          entityType,
          id: "projected-stray",
          visibilityScope: "shared",
        }),
      ).toEqual(before);
      expect(
        await store.getRuleMemo({
          ruleId: update.ruleId,
          ruleVersion: update.ruleVersion,
          inputFingerprint: update.inputFingerprint,
        }),
      ).toBeNull();
    },
  );

  test("directory-sync refuses an unlisted imported value and succeeds after reopening", async () => {
    const source = await createTestDirectory();
    const target = await createTestDirectory();
    cleanups.push(source.cleanup, target.cleanup);
    const original = await open(source.dir, true);
    const syncPath = `${source.dir}/content`;
    const exporter = new DirectorySync({
      syncPath,
      entityService: original,
      logger: createSilentLogger(),
      autoSync: false,
    });
    await exporter.initialize();
    const content = "---\ntitle: Imported\nclients: [Gamma]\n---\n\nBody";
    await original.createEntity({
      entity: {
        ...original.deserializeEntity(content, "note"),
        entityType: "note",
        id: "imported",
        content,
        metadata: { title: "Imported" },
      },
    });
    const entity = await original.getEntity({
      entityType: "note",
      id: "imported",
    });
    if (!entity) throw new Error("Missing export entity");
    await exporter.fileOps.writeEntity(entity);
    const service = await open(target.dir, true);
    const request = await editor(service);
    expect(
      (
        await request(
          "POST",
          "entities",
          {
            entityType: "grouping-vocabulary",
            frontmatter: {
              groupings: { clients: { multiple: true, values: ["Acme"] } },
              visibility: "shared",
            },
          },
          "admin",
        )
      ).status,
    ).toBe(201);
    const importer = new DirectorySync({
      syncPath,
      entityService: service,
      logger: createSilentLogger(),
      autoSync: false,
      deleteOnFileRemoval: false,
    });
    async function queuedImport(operationId: string): Promise<ImportResult> {
      const batch = {
        operationId,
        rootJobId: operationId,
        expectedChildren: 2,
      };
      await service.prepareDurableBulkMutation({
        source: "directory-sync",
        ...batch,
      });
      await service.finalizeDurableBulkMutationEnqueue(operationId);
      const importRef = { ...batch, childKey: "0:directory-import" };
      const imported = await service.runDurableBulkMutationChild(
        {
          source: "directory-sync",
          ...importRef,
          jobId: `${operationId}:import`,
        },
        () =>
          importer.importEntitiesWithProgress(
            undefined,
            createMockProgressReporter(),
            100,
            importRef,
          ),
      );
      await service.settleDurableBulkMutationChild({
        operationId,
        childKey: importRef.childKey,
        jobId: `${operationId}:import`,
        outcome: "completed",
      });
      const cleanupRef = { ...batch, childKey: "1:directory-cleanup" };
      await service.runDurableBulkMutationChild(
        {
          source: "directory-sync",
          ...cleanupRef,
          jobId: `${operationId}:cleanup`,
        },
        () => importer.removeOrphanedEntities(cleanupRef),
      );
      await service.settleDurableBulkMutationChild({
        operationId,
        childKey: cleanupRef.childKey,
        jobId: `${operationId}:cleanup`,
        outcome: "completed",
      });
      expect(
        await service.getProjectionStore().getProjectionBatchDiagnostics(),
      ).toMatchObject({ preparing: 0, open: 0 });
      return imported;
    }
    const refused = await queuedImport("refused-import");
    expect(refused).toMatchObject({ imported: 0, failed: 1 });
    expect(JSON.stringify(refused.errors)).toContain("Clients");
    expect(
      await service.getEntity({ entityType: "note", id: "imported" }),
    ).toBeNull();
    expect(
      (
        await request(
          "DELETE",
          "entities?type=grouping-vocabulary&id=grouping-vocabulary",
          { confirmed: true },
          "admin",
        )
      ).status,
    ).toBe(200);
    expect(await queuedImport("reopened-import")).toMatchObject({
      imported: 1,
      failed: 0,
    });
    expect((await service.queryGroupingCatalog(query)).values).toEqual([
      { value: "Gamma", count: 1 },
    ]);
  });

  test("real directory-sync exports one file per identity and reimports exact multi-membership", async () => {
    const source = await createTestDirectory();
    cleanups.push(source.cleanup);
    const target = await createTestDirectory();
    cleanups.push(target.cleanup);
    const original = await open(source.dir, true);
    const syncPath = `${source.dir}/content`;
    const exporter = new DirectorySync({
      syncPath,
      entityService: original,
      logger: createSilentLogger(),
      autoSync: false,
    });
    await exporter.initialize();
    for (const entityType of ["note", "post"]) {
      const content = `---\ntitle: Shared\n${entityType === "post" ? "status: draft\nslug: shared\nexcerpt: Shared\nauthor: Tester\n" : ""}clients: [Acme, Beta]\nunclaimed: null\n---\n\n# Shared\n\nBody`;
      const parsed = original.deserializeEntity(content, entityType);
      await original.createEntity({
        entity: {
          ...parsed,
          metadata: parsed.metadata ?? {},
          content,
          entityType,
          id: "shared",
        },
      });
    }
    for (const entityType of ["note", "post"]) {
      const entity = await original.getEntity({ entityType, id: "shared" });
      if (!entity) throw new Error("Missing export entity");
      await exporter.fileOps.writeEntity(entity);
    }
    const paths = (await exporter.getAllMarkdownFiles()).sort();
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      const text = await readFile(`${syncPath}/${path}`, "utf8");
      expect(text).toContain("clients:");
      expect(text).toContain("unclaimed: null");
    }
    const imported = await open(target.dir, true);
    const importer = new DirectorySync({
      syncPath,
      entityService: imported,
      logger: createSilentLogger(),
      autoSync: false,
    });
    expect(await importer.importEntities()).toMatchObject({ imported: 2 });
    expect((await imported.queryGroupingCatalog(query)).values).toEqual([
      { value: "Acme", count: 2 },
      { value: "Beta", count: 2 },
    ]);
    const note = await original.getEntity({ entityType: "note", id: "shared" });
    if (!note) throw new Error("Missing note");
    await original.updateEntity({
      entity: { ...note, content: note.content.replace("Acme", "Gamma") },
    });
    const updated = await original.getEntity({
      entityType: "note",
      id: "shared",
    });
    if (!updated) throw new Error("Missing updated note");
    await exporter.fileOps.writeEntity(updated);
    expect((await exporter.getAllMarkdownFiles()).sort()).toEqual(paths);
    expect(await importer.importEntities()).toMatchObject({
      imported: 1,
      skipped: 1,
    });
    expect(
      (
        await imported.queryGroupingMembers({ ...query, value: "Acme" })
      ).entities.map((entity) => [entity.entityType, entity.id]),
    ).toEqual([["post", "shared"]]);
    expect(
      (
        await imported.queryGroupingMembers({ ...query, value: "Gamma" })
      ).entities.map((entity) => [entity.entityType, entity.id]),
    ).toEqual([["note", "shared"]]);
  });
  test("creates, updates, exports/reimports, disables, and re-enables without losing source membership", async () => {
    const directory = await createTestDirectory();
    cleanups.push(directory.cleanup);
    let service = await open(directory.dir, true);
    for (const type of ["note", "post"]) {
      const source = `---\ntitle: Example\n${type === "post" ? "status: draft\n" : ""}slug: example\nexcerpt: Example\nauthor: Tester\nclients: [Acme, Beta]\nunclaimed: retained\n---\n\nBody`;
      const parsed = service.deserializeEntity(source, type);
      await service.createEntity({
        entity: {
          ...parsed,
          metadata: parsed.metadata ?? {},
          entityType: type,
          id: "legacy:entry",
          content: source,
        },
      });
    }
    expect((await service.queryGroupingCatalog(query)).values).toEqual([
      { value: "Acme", count: 2 },
      { value: "Beta", count: 2 },
    ]);
    const note = await service.getEntity(
      { entityType: "note", id: "legacy:entry" },
      noteSchema,
    );
    if (!note) throw new Error("Missing note");
    expect(note.metadata).not.toHaveProperty("clients");
    await service.updateEntity({
      entity: { ...note, content: note.content.replace("Body", "Edited body") },
    });
    const post = await service.getEntity(
      { entityType: "post", id: "legacy:entry" },
      blogPostSchema,
    );
    if (!post) throw new Error("Missing post");
    expect(post.metadata).not.toHaveProperty("clients");
    const path = `${directory.dir}/post.md`;
    await writeFile(path, service.serializeEntity(post));
    const exported = await readFile(path, "utf8");
    expect(
      service.deserializeEntity(exported, "post").metadata?.["clients"],
    ).toEqual(["Acme", "Beta"]);
    const fresh = await createTestDirectory();
    cleanups.push(fresh.cleanup);
    const imported = await open(fresh.dir, true);
    const parsedImport = imported.deserializeEntity(exported, "post");
    await imported.createEntity({
      entity: {
        ...parsedImport,
        metadata: parsedImport.metadata ?? {},
        entityType: "post",
        id: post.id,
        content: exported,
      },
    });
    expect(
      (
        await imported.queryGroupingMembers({ ...query, value: "Acme" })
      ).entities.map((entity) => entity.id),
    ).toEqual(["legacy:entry"]);
    service.close();
    services.splice(services.indexOf(service), 1);
    service = await open(directory.dir, false);
    const inactive = await service.getEntity(
      { entityType: "post", id: post.id },
      blogPostSchema,
    );
    if (!inactive) throw new Error("Missing inactive post");
    await service.updateEntity({
      entity: {
        ...inactive,
        content: inactive.content.replace("Body", "Unrelated body edit"),
      },
    });
    const saved = await service.getEntity({ entityType: "post", id: post.id });
    if (!saved) throw new Error("Missing saved post");
    expect(service.serializeEntity(saved)).toContain("clients:");
    expect(service.serializeEntity(saved)).toContain("unclaimed: retained");
    service.close();
    services.splice(services.indexOf(service), 1);
    service = await open(directory.dir, true);
    await service.reprojectRegisteredGroupings();
    expect((await service.queryGroupingCatalog(query)).values).toEqual([
      { value: "Acme", count: 2 },
      { value: "Beta", count: 2 },
    ]);
  });
});
