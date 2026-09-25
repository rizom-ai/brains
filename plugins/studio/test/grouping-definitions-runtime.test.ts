import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createClient } from "@libsql/client";
import { computeContentHash } from "@brains/utils/hash";
import { StudioApi } from "../ui-react/src/api";
import { mountStudio, waitForStudio } from "./fixtures/mounted-studio";
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
    getGroupingDefinitions: () => source.getSnapshot(),
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
  test("the mounted editor creates shared definitions, retains duplicate-key drafts and refuses stale saves", async () => {
    const fixture = await open(await directory());
    const original =
      "---\ntitle: Existing\nclients: [Acme, Beta]\n---\n\nKeep this source";
    await fixture.service.createEntityFromMarkdown({
      input: { entityType: "note", id: "existing", markdown: original },
    });
    const before = await fixture.service.getEntityRaw({
      entityType: "note",
      id: "existing",
    });
    expect(before).not.toBeNull();
    const writes: string[] = [];
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(String(input), "https://studio.test");
        const method = init?.method ?? "GET";
        if (method !== "GET") writes.push(method);
        return fixture.request(
          method,
          `${url.pathname.slice("/studio/api/".length)}${url.search}`,
          init?.body ? JSON.parse(String(init.body)) : undefined,
        );
      },
    });
    const ui = await mountStudio(api, "/studio/entities/grouping-definitions");
    const saveButton = (): HTMLButtonElement | null =>
      document.querySelector(
        'form[aria-label="Document editor"] button[type=submit]',
      );
    try {
      await waitForStudio(() =>
        document.body.textContent.includes("Your first grouping"),
      );
      expect(saveButton()?.disabled).toBe(true);
      expect(
        await fixture.service.getEntityRaw({
          entityType: type,
          id: type,
          visibilityScope: "shared",
        }),
      ).toBeNull();
      await ui.click("Add grouping");
      await ui.input("New grouping key", "clients");
      await ui.input("New grouping label", "Clients");
      await ui.click("Notes contributor");
      const cardinality = document.querySelector<HTMLSelectElement>(
        '[aria-label="Clients values per entry"]',
      );
      if (!cardinality) throw new Error("Missing cardinality");
      await act(async () => {
        cardinality.value = "one";
        cardinality.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(saveButton()?.disabled).toBe(false);
      await ui.click("Save changes");
      await waitForStudio(
        () =>
          document.querySelector<HTMLInputElement>('[aria-label="Clients key"]')
            ?.readOnly === true,
      );
      expect(writes).toEqual(["POST"]);
      const saved = await fixture.service.getEntityRaw({
        entityType: type,
        id: type,
        visibilityScope: "shared",
      });
      expect(saved?.visibility).toBe("shared");
      expect(fixture.source.getSnapshot().groupings).toEqual({
        clients: { label: "Clients", types: ["note"], multiple: false },
      });
      expect(
        (
          await fixture.service.getEntityRaw({
            entityType: "note",
            id: "existing",
          })
        )?.content,
      ).toBe(before?.content);
      await ui.click("Add grouping");
      await ui.input("New grouping label", "Topics");
      await ui.input("Topics key", "clients");
      expect(
        document.querySelectorAll('input[aria-label$="key"][value="clients"]'),
      ).toHaveLength(2);
      expect(saveButton()?.disabled).toBe(true);
      const form = document.querySelector('form[aria-label="Document editor"]');
      await act(async () => {
        form?.dispatchEvent(
          new window.KeyboardEvent("keydown", {
            key: "s",
            ctrlKey: true,
            bubbles: true,
          }),
        );
        form?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      expect(writes).toEqual(["POST"]);
      await act(async () => ui.history.push("/studio/entities/note"));
      await waitForStudio(() =>
        document.body.textContent.includes("Discard unsaved changes?"),
      );
      await ui.click("Keep editing");
      expect(
        document.querySelectorAll('input[aria-label$="key"][value="clients"]'),
      ).toHaveLength(2);
      await ui.click("Remove Topics grouping");
      await ui.click("Remove grouping");
      await waitForStudio(() => saveButton()?.disabled === true);
      await ui.input("Clients label", "My clients");
      expect(
        (
          await save(
            fixture,
            {
              clients: { label: "Elsewhere", types: ["note"], multiple: false },
            },
            "PUT",
          )
        ).status,
      ).toBe(200);
      await ui.click("Save changes");
      await waitForStudio(() =>
        document.body.textContent.includes("changed since"),
      );
      expect(
        document.querySelector<HTMLInputElement>(
          '[aria-label="My clients label"]',
        )?.value,
      ).toBe("My clients");
      expect(fixture.source.getSnapshot().groupings["clients"]?.label).toBe(
        "Elsewhere",
      );
    } finally {
      await ui.close();
    }
  });

  test("the mounted removal uses distinct usage and saves without rewriting member source", async () => {
    const fixture = await open(await directory());
    expect(
      (
        await save(fixture, {
          clients: {
            label: "Clients",
            types: ["note"],
            multiple: true,
            values: ["Acme", "Beta"],
          },
        })
      ).status,
    ).toBe(201);
    await fixture.service.createEntityFromMarkdown({
      input: {
        entityType: "note",
        id: "member",
        markdown: "---\ntitle: Member\nclients: [Acme, Beta]\n---\n\nUntouched",
      },
    });
    const before = await fixture.service.getEntityRaw({
      entityType: "note",
      id: "member",
    });
    expect(before).not.toBeNull();
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(String(input), "https://studio.test");
        return fixture.request(
          init?.method ?? "GET",
          `${url.pathname.slice("/studio/api/".length)}${url.search}`,
          init?.body ? JSON.parse(String(init.body)) : undefined,
        );
      },
    });
    const ui = await mountStudio(api, "/studio/entities/grouping-definitions");
    try {
      await waitForStudio(
        () =>
          document.querySelectorAll(
            '[aria-label="Grouping definitions"] [aria-label="1 entries"]',
          ).length === 2,
      );
      await ui.click("Remove Clients grouping");
      expect(
        document.querySelector('[role="alertdialog"]')?.textContent,
      ).toContain("1 entry carries this grouping and keeps its values");
      await ui.click("Remove grouping");
      await ui.click("Save changes");
      await waitForStudio(
        () =>
          document.body.textContent.includes("Your first grouping") &&
          document.body.textContent.includes("Saved"),
      );
      expect(fixture.source.getSnapshot().groupings).toEqual({});
      expect(
        (
          await fixture.service.getEntityRaw({
            entityType: "note",
            id: "member",
          })
        )?.content,
      ).toBe(before?.content);
    } finally {
      await ui.close();
    }
  });

  test("the mounted usage display distinguishes initialization and failure, then retries without inventing zero", async () => {
    const fixture = await open(await directory());
    expect(
      (
        await save(fixture, {
          clients: {
            label: "Clients",
            types: ["note"],
            multiple: true,
            values: ["Acme"],
          },
        })
      ).status,
    ).toBe(201);
    let state: "initializing" | "error" | "ready" = "initializing";
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(String(input), "https://studio.test");
        if (url.pathname.endsWith("/groups/usage") && state !== "ready")
          return state === "initializing"
            ? Response.json(
                { error: "Initializing", code: "groupings_initializing" },
                { status: 503, headers: { "Retry-After": "0.02" } },
              )
            : Response.json({ error: "Usage read failed" }, { status: 500 });
        return fixture.request(
          init?.method ?? "GET",
          `${url.pathname.slice("/studio/api/".length)}${url.search}`,
          init?.body ? JSON.parse(String(init.body)) : undefined,
        );
      },
    });
    const ui = await mountStudio(api, "/studio/entities/grouping-definitions");
    try {
      await waitForStudio(() =>
        document.body.textContent.includes("Groupings are initializing"),
      );
      expect(document.querySelector('[aria-label="0 entries"]')).toBeNull();
      state = "error";
      await waitForStudio(() =>
        document.body.textContent.includes("Retry usage"),
      );
      expect(document.querySelector('[aria-label="0 entries"]')).toBeNull();
      expect(document.body.textContent).toContain("Usage is unavailable");
      await ui.click("Remove Clients grouping");
      expect(
        document.querySelector('[role="alertdialog"]')?.textContent,
      ).toContain("Usage is unavailable");
      expect(
        document.querySelector('[role="alertdialog"]')?.textContent,
      ).not.toContain("0 entries");
      await ui.click("Keep grouping");
      state = "ready";
      await ui.click("Retry usage");
      await waitForStudio(
        () => document.querySelector('[aria-label="0 entries"]') !== null,
      );
      expect(document.body.textContent).not.toContain("Retry usage");
    } finally {
      await ui.close();
    }
  });

  test("the mounted page retains an unavailable stored contributor until explicit repair", async () => {
    const dir = await directory();
    const fixture = await open(dir);
    expect((await save(fixture, { areas })).status).toBe(201);
    const broken =
      "---\nvisibility: shared\ngroupings:\n  areas:\n    label: Areas\n    types: [gone]\n    multiple: true\n---\n";
    const database = createClient({ url: `file:${dir}/entities.db` });
    try {
      await database.execute({
        sql: "UPDATE entities SET content = ?, contentHash = ? WHERE entityType = ? AND id = ?",
        args: [broken, computeContentHash(broken), type, type],
      });
    } finally {
      database.close();
    }
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(String(input), "https://studio.test");
        return fixture.request(
          init?.method ?? "GET",
          `${url.pathname.slice("/studio/api/".length)}${url.search}`,
          init?.body ? JSON.parse(String(init.body)) : undefined,
        );
      },
    });
    const ui = await mountStudio(api, "/studio/entities/grouping-definitions");
    try {
      await waitForStudio(() =>
        document.body.textContent.includes("gone (unavailable)"),
      );
      expect(
        document.querySelector<HTMLInputElement>(
          '[aria-label="gone contributor"]',
        )?.checked,
      ).toBe(true);
      expect(
        (
          await fixture.service.getEntityRaw({
            entityType: type,
            id: type,
            visibilityScope: "shared",
          })
        )?.content,
      ).toBe(broken);
      await ui.click("gone contributor");
      await ui.click("Notes contributor");
      await waitForStudio(
        () =>
          document.querySelector<HTMLButtonElement>(
            'form[aria-label="Document editor"] button[type=submit]',
          )?.disabled === false,
      );
      await ui.click("Save changes");
      await waitForStudio(() => document.body.textContent.includes("Saved"));
      expect(fixture.source.getSnapshot().groupings["areas"]?.types).toEqual([
        "note",
      ]);
      expect(fixture.source.getSnapshot().issues).toEqual([]);
    } finally {
      await ui.close();
    }
  });

  test("unparseable definitions stay visible and need an explicit reset before saving", async () => {
    const dir = await directory();
    const fixture = await open(dir);
    expect((await save(fixture, { areas })).status).toBe(201);
    const broken = "---\ngroupings: [unterminated\n---\n";
    const database = createClient({ url: `file:${dir}/entities.db` });
    try {
      await database.execute({
        sql: "UPDATE entities SET content = ?, contentHash = ? WHERE entityType = ? AND id = ?",
        args: [broken, computeContentHash(broken), type, type],
      });
    } finally {
      database.close();
    }
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(String(input), "https://studio.test");
        return fixture.request(
          init?.method ?? "GET",
          `${url.pathname.slice("/studio/api/".length)}${url.search}`,
          init?.body ? JSON.parse(String(init.body)) : undefined,
        );
      },
    });
    const ui = await mountStudio(api, "/studio/entities/grouping-definitions");
    try {
      await waitForStudio(() =>
        document.body.textContent.includes("Replace invalid definitions"),
      );
      expect(
        document.querySelector('[aria-label="Grouping definitions"] pre')
          ?.textContent,
      ).toContain("unterminated");
      expect(document.querySelector("[data-definition-add]")).toBeNull();
      expect(
        document.querySelector<HTMLButtonElement>(
          'form[aria-label="Document editor"] button[type=submit]',
        )?.disabled,
      ).toBe(true);
      expect(
        (
          await fixture.service.getEntityRaw({
            entityType: type,
            id: type,
            visibilityScope: "shared",
          })
        )?.content,
      ).toBe(broken);
      await ui.click("Replace invalid definitions");
      await ui.click("Replace definitions");
      await ui.click("Save changes");
      await waitForStudio(
        () =>
          document.body.textContent.includes("Your first grouping") &&
          document.body.textContent.includes("Saved"),
      );
      const repaired = await fixture.service.getEntityRaw({
        entityType: type,
        id: type,
        visibilityScope: "shared",
      });
      expect(repaired).not.toBeNull();
      expect(parseMarkdown(repaired?.content ?? "")).toMatchObject({
        frontmatter: { groupings: {} },
        content: "",
      });
      expect(fixture.source.getSnapshot().issues).toEqual([]);
    } finally {
      await ui.close();
    }
  });

  test("the mounted definitions page is read-only for trusted readers", async () => {
    const fixture = await open(await directory());
    expect((await save(fixture, { areas })).status).toBe(201);
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(String(input), "https://studio.test");
        expect(init?.method ?? "GET").toBe("GET");
        return fixture.request(
          "GET",
          `${url.pathname.slice("/studio/api/".length)}${url.search}`,
          undefined,
          "trusted",
        );
      },
    });
    const ui = await mountStudio(api, "/studio/entities/grouping-definitions");
    try {
      await waitForStudio(() =>
        document.body.textContent.includes("Only administrators can change"),
      );
      const field = document.querySelector(
        '[aria-label="Grouping definitions"]',
      );
      expect(
        field?.querySelectorAll("button,input,select,textarea"),
      ).toHaveLength(0);
      expect(
        document.querySelector(
          'form[aria-label="Document editor"] button[type=submit]',
        ),
      ).toBeNull();
    } finally {
      await ui.close();
    }
  });

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

  test("saving a definition indexes existing notes; adding a contributor scans only that type", async () => {
    const fixture = await open(await directory());
    for (const entityType of ["note", "post"]) {
      await fixture.service.createEntityFromMarkdown({
        input: {
          entityType,
          id: "existing",
          markdown: content(["Research"], entityType),
        },
      });
    }
    const projected = spyOn(fixture.registry, "projectStoredMetadata");
    expect(
      (await save(fixture, { areas: { ...areas, types: ["note"] } })).status,
    ).toBe(201);
    expect(projected.mock.calls.map((call) => call[0])).toEqual(["note"]);
    expect(fixture.service.areGroupingsReady()).toBe(true);
    expect(fixture.source.getSnapshot().groupings["areas"]?.types).toEqual([
      "note",
    ]);
    projected.mockClear();
    expect((await save(fixture, { areas }, "PUT")).status).toBe(200);
    expect(projected.mock.calls.map((call) => call[0])).toEqual(["post"]);
    const catalog = await fixture.request(
      "GET",
      "groups/catalog?grouping=areas",
    );
    expect(await catalog.json()).toMatchObject({
      values: [{ value: "Research", count: 2 }],
    });
    projected.mockClear();
    expect(
      (
        await save(
          fixture,
          { areas: { ...areas, label: "Research areas", multiple: false } },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(projected).not.toHaveBeenCalled();
    expect((await save(fixture, {}, "PUT")).status).toBe(200);
    expect(projected).not.toHaveBeenCalled();
  });

  test("Studio returns initializing while a successful scan is still checking its final source revision", async () => {
    const fixture = await open(await directory());
    await fixture.service.createEntityFromMarkdown({
      input: {
        entityType: "note",
        id: "existing",
        markdown: content(["Research"]),
      },
    });
    let projected = false;
    const project = fixture.registry.projectStoredMetadata.bind(
      fixture.registry,
    );
    spyOn(fixture.registry, "projectStoredMetadata").mockImplementation(
      (...args) => {
        projected = true;
        return project(...args);
      },
    );
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let waiting = false;
    const refresh = fixture.source.ensureCurrent.bind(fixture.source);
    spyOn(fixture.source, "ensureCurrent").mockImplementation(
      async (options) => {
        if (projected && !waiting) {
          waiting = true;
          entered?.();
          await gate;
        }
        await refresh(options);
      },
    );
    const saving = save(fixture, { areas });
    try {
      await Promise.race([
        held,
        saving.then(() => {
          throw new Error("Save finished without holding the scan");
        }),
      ]);
      expect(fixture.service.areGroupingsReady()).toBe(false);
      const response = await fixture.request(
        "GET",
        "groups/catalog?grouping=areas",
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: "groupings_initializing",
      });
    } finally {
      release?.();
      await saving;
    }
    expect(fixture.service.areGroupingsReady()).toBe(true);
    expect(
      await (
        await fixture.request("GET", "groups/catalog?grouping=areas")
      ).json(),
    ).toMatchObject({ values: [{ value: "Research", count: 1 }] });
  });

  test.each(["create", "update", "upsert", "noop"])(
    "%s refuses stale preparation at commit and succeeds on a fresh retry",
    async (operation) => {
      const dir = await directory();
      const writer = await open(dir);
      if (operation === "noop")
        expect((await save(writer, { areas })).status).toBe(201);
      if (operation !== "create")
        await writer.service.createEntityFromMarkdown({
          input: {
            entityType: "note",
            id: "late",
            markdown: content(["Research"]),
          },
        });
      const worker = await open(dir);
      const existing = await worker.service.getEntityRaw({
        entityType: "note",
        id: "late",
      });
      const write = async (): Promise<unknown> => {
        if (operation === "create")
          return worker.service.createEntityFromMarkdown({
            input: {
              entityType: "note",
              id: "late",
              markdown: content(["Research"]),
            },
          });
        if (!existing) throw new Error("Missing existing Note");
        const entity = {
          ...existing,
          content:
            operation === "noop"
              ? existing.content
              : `${existing.content}\nChanged`,
        };
        return operation === "upsert"
          ? worker.service.upsertEntity({ entity })
          : worker.service.updateEntity({ entity });
      };
      let release: (() => void) | undefined;
      let entered: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const held = new Promise<void>((resolve) => {
        entered = resolve;
      });
      worker.registry.registerPersistValidator("note", async () => {
        entered?.();
        await gate;
      });
      const writing = write().catch((error: unknown) => error);
      let refused: unknown;
      let exports: Awaited<
        ReturnType<EntityService["listPendingEntityExports"]>
      >;
      try {
        await Promise.race([
          held,
          writing.then(() => {
            throw new Error(
              "Write finished before the guard test could pause it",
            );
          }),
        ]);
        expect(
          (
            await save(
              writer,
              { areas: { ...areas, values: ["Research"] } },
              operation === "noop" ? "PUT" : "POST",
            )
          ).status,
        ).toBe(operation === "noop" ? 200 : 201);
        exports = await writer.service.listPendingEntityExports();
      } finally {
        release?.();
        refused = await writing;
      }
      expect(refused).toMatchObject({
        name: "EntityValidationError",
        phase: "persist",
        originalError: {
          issues: [
            {
              path: [],
              message:
                "Grouping definitions changed while saving. Review the current rules and try again.",
            },
          ],
        },
      });
      const after = await worker.service.getEntityRaw({
        entityType: "note",
        id: "late",
      });
      expect(after?.content).toBe(existing?.content);
      expect(after?.updated).toBe(existing?.updated);
      expect(await worker.service.listPendingEntityExports()).toEqual(exports);
      await write();
      expect(
        (
          await writer.service.queryGroupingCatalog({
            grouping: "areas",
            entityTypes: ["note"],
          })
        ).values,
      ).toEqual([{ value: "Research", count: 1 }]);
    },
  );

  test("source projection reconciliation conservatively checks retained fields after commit", async () => {
    const dir = await directory();
    const writer = await open(dir);
    await writer.service.createEntityFromMarkdown({
      input: {
        entityType: "note",
        id: "existing",
        markdown: content(["Research"]),
      },
    });
    expect((await save(writer, { areas })).status).toBe(201);
    const reader = await open(dir);
    const scan = spyOn(reader.registry, "projectStoredMetadata");
    expect(
      (await save(writer, { areas: { ...areas, label: "Renamed" } }, "PUT"))
        .status,
    ).toBe(200);
    const row = await writer.service.getEntityRaw({
      entityType: type,
      id: type,
      visibilityScope: "shared",
    });
    if (!row) throw new Error("Missing saved definitions");
    await reader.service.reconcileProjectionTargets([
      {
        entityType: type,
        entityId: type,
        operation: "upsert",
        contentHash: row.contentHash,
      },
    ]);
    expect(scan).toHaveBeenCalled();
    expect(reader.service.areGroupingsReady()).toBe(true);
  });

  test("usage loads current definitions, counts identities once and hides restricted memberships", async () => {
    const dir = await directory();
    const writer = await open(dir);
    const reader = await open(dir);
    for (const [id, entityType, visibility, values] of [
      ["same\u0000:leaf", "note", "shared", ["Research", "Research", "Lab"]],
      ["same\u0000:leaf", "post", "public", ["Research", "Lab"]],
      ["private", "note", "restricted", ["Research"]],
      ["stray", "note", "shared", ["Outside the list"]],
      ["empty", "note", "shared", []],
    ] as const) {
      await writer.service.createEntityFromMarkdown({
        input: {
          entityType,
          id,
          markdown: content([...values], entityType).replace(
            "---\n",
            `---\nvisibility: ${visibility}\n`,
          ),
        },
      });
    }
    expect((await save(writer, { areas })).status).toBe(201);
    const query = {
      grouping: "areas",
      entityTypes: ["note", "post"],
      visibilityScope: "shared" as const,
      values: ["Research", "Lab", "Unused"],
    };
    // The reader has made no schema/catalog request since the source was saved.
    expect(await reader.service.queryGroupingUsage(query)).toEqual({
      entries: 3,
      values: [
        { value: "Research", count: 2 },
        { value: "Lab", count: 2 },
        { value: "Unused", count: 0 },
      ],
    });
    expect(
      await (
        await reader.request(
          "GET",
          "groups/usage?grouping=areas&value=Research&visibilityScope=restricted&entityTypes=note",
          undefined,
          "trusted",
        )
      ).json(),
    ).toEqual({
      entries: 3,
      values: [{ value: "Research", count: 2 }],
    });
    expect(
      await (
        await reader.request(
          "GET",
          "groups/usage?grouping=areas&value=Research",
        )
      ).json(),
    ).toEqual({
      entries: 4,
      values: [{ value: "Research", count: 3 }],
    });
    expect(
      (await save(writer, { areas: { ...areas, types: ["note"] } }, "PUT"))
        .status,
    ).toBe(200);
    expect(await reader.service.queryGroupingUsage(query)).toEqual({
      entries: 2,
      values: [
        { value: "Research", count: 1 },
        { value: "Lab", count: 1 },
        { value: "Unused", count: 0 },
      ],
    });
    expect((await save(writer, {}, "PUT")).status).toBe(200);
    expect(
      (await reader.request("GET", "groups/usage?grouping=areas")).status,
    ).toBe(404);
  });

  test("a failed post-save scan keeps the saved document and returns initializing until retry succeeds", async () => {
    const fixture = await open(await directory());
    await fixture.service.createEntityFromMarkdown({
      input: {
        entityType: "note",
        id: "existing",
        markdown: content(["Research"]),
      },
    });
    const fail = spyOn(
      fixture.registry,
      "projectStoredMetadata",
    ).mockImplementation(() => {
      throw new Error("Interrupted scan");
    });
    expect((await save(fixture, { areas })).status).toBe(201);
    expect(
      await fixture.service.getEntityRaw({
        entityType: type,
        id: type,
        visibilityScope: "shared",
      }),
    ).not.toBeNull();
    expect(fixture.service.areGroupingsReady()).toBe(false);
    const response = await fixture.request(
      "GET",
      "groups/catalog?grouping=areas",
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(await response.json()).toMatchObject({
      code: "groupings_initializing",
    });
    const usage = await fixture.request(
      "GET",
      "groups/usage?grouping=areas&value=Research",
    );
    expect(usage.status).toBe(503);
    expect(usage.headers.get("Retry-After")).toBe("1");
    const failedUsage = await fixture.service
      .queryGroupingUsage({
        grouping: "areas",
        entityTypes: ["note"],
        values: ["Research"],
      })
      .catch((error: unknown): unknown => error);
    expect(failedUsage).toBeInstanceOf(Error);
    expect(failedUsage).toMatchObject({ message: "Interrupted scan" });
    // Drain the unsuccessful caller-owned retry before restoring the backend.
    await fixture.service
      .queryGroupingCatalog({ grouping: "areas", entityTypes: ["note"] })
      .catch(() => undefined);
    fail.mockRestore();
    expect(
      await fixture.service.queryGroupingUsage({
        grouping: "areas",
        entityTypes: ["note"],
        values: ["Research", "Unused"],
      }),
    ).toEqual({
      entries: 1,
      values: [
        { value: "Research", count: 1 },
        { value: "Unused", count: 0 },
      ],
    });
    expect(
      await (
        await fixture.request(
          "GET",
          "groups/usage?grouping=areas&value=Research",
        )
      ).json(),
    ).toEqual({
      entries: 1,
      values: [{ value: "Research", count: 1 }],
    });
    expect(
      (
        await fixture.service.queryGroupingCatalog({
          grouping: "areas",
          entityTypes: ["note"],
        })
      ).values,
    ).toEqual([{ value: "Research", count: 1 }]);
    expect(fixture.service.areGroupingsReady()).toBe(true);
  });

  test("the definitions control document cannot be a grouping contributor", async () => {
    const fixture = await open(await directory());
    const response = await save(fixture, {
      areas: { ...areas, types: [type] },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["groupings", "areas", "types"] }),
      ]),
    });
    expect(fixture.registry.getGroupings()).toEqual([]);
  });

  test("an explicit rescan recovers an exact-row restore even with identical timestamps", async () => {
    const dir = await directory();
    const writer = await open(dir);
    await writer.service.createEntityFromMarkdown({
      input: {
        entityType: "note",
        id: "member",
        markdown: content(["Before"]),
      },
    });
    expect((await save(writer, { areas })).status).toBe(201);
    const original = await writer.service.getEntityRaw({
      entityType: type,
      id: type,
      visibilityScope: "shared",
    });
    if (!original) throw new Error("Missing definitions");
    const reader = await open(dir);
    expect(
      (
        await reader.service.queryGroupingCatalog({
          grouping: "areas",
          entityTypes: ["note"],
        })
      ).values,
    ).toEqual([{ value: "Before", count: 1 }]);
    await writer.service.deleteEntity({ entityType: type, id: type });
    const note = await writer.service.getEntityRaw({
      entityType: "note",
      id: "member",
    });
    if (!note) throw new Error("Missing member");
    await writer.service.updateEntity({
      entity: { ...note, content: content(["After"]) },
    });
    const interrupted = spyOn(
      writer.registry,
      "projectStoredMetadata",
    ).mockImplementation(() => {
      throw new Error("Test scan interrupted");
    });
    try {
      await writer.service.createEntity({ entity: original });
    } finally {
      interrupted.mockRestore();
    }
    expect(
      await writer.service.getEntityRaw({
        entityType: type,
        id: type,
        visibilityScope: "shared",
      }),
    ).toEqual(original);
    // Exact database restores use the operator's fenced restart/rescan procedure.
    // An unchanged row is not an edit-history or completion signal.
    await reader.service.reprojectRegisteredGroupings();
    expect(
      (
        await reader.service.queryGroupingCatalog({
          grouping: "areas",
          entityTypes: ["note"],
        })
      ).values,
    ).toEqual([{ value: "After", count: 1 }]);
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
    const detail = await reader.request(
      "GET",
      `entities?type=${type}&id=${type}`,
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      entity: { frontmatter: { groupings: { areas: { values } } } },
    });
    expect(
      (
        await save(
          reader,
          { areas: { ...areas, label: "Research areas", values } },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(reader.source.getSnapshot().groupings["areas"]?.values).toEqual(
      values,
    );
    expect(resolvedRead).not.toHaveBeenCalled();
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
    // Before deserialization, then again under the transaction's writer lock.
    expect(reads).toHaveBeenCalledTimes(2);
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
    const metadataScan = spyOn(worker.registry, "projectStoredMetadata");
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
    expect(metadataScan).not.toHaveBeenCalled();
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
