/** @jsxImportSource react */
import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { AuthServicePlugin } from "@brains/auth-service";
import { createClient } from "@libsql/client";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { installContributors } from "./contributors";
import { imageMetadataFor } from "@brains/image";
import {
  PermissionService,
  type EntityActionPolicyRule,
} from "@brains/templates";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  instantiate,
  type GroupingDefinitionsFrontmatter,
} from "@brains/studio/test";
import { StudioApi, mountStudio, waitForStudio } from "@brains/studio/test/ui";

const type = "grouping-definitions";
const base = "/authoring";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(): Promise<{
  service: EntityService;
  databaseUrl: string;
  api(role?: "admin" | "trusted"): StudioApi;
  request(
    method: string,
    path: string,
    body?: unknown,
    role?: "admin" | "trusted" | "anonymous",
  ): Promise<Response>;
}> {
  const directory = await createTestDirectory();
  cleanups.push(directory.cleanup);
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  const service = EntityService.createFresh({
    dbConfig,
    entityRegistry: registry,
    logger,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
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
  cleanups.push(async (): Promise<void> => {
    service.close();
  });
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
        entityActionFloor: (entityType): EntityActionPolicyRule | undefined =>
          registry.getEntityTypeConfig(entityType).actionPolicy,
      },
    ),
  );
  const auth = new AuthServicePlugin({ storageDir: `${directory.dir}/auth` });
  await auth.register(shell);
  cleanups.push(async (): Promise<void> => {
    await auth.shutdown();
  });
  const cookies = new Map<string, string>();
  for (const role of ["admin", "trusted"] as const) {
    const user = await auth
      .getService()
      .createUser({ displayName: role, role });
    const session = await auth.getService().createAuthSession(user.userId);
    cookies.set(role, session.cookie);
  }
  const plugin = instantiate({ routePath: base });
  await plugin.register(shell);
  cleanups.push(async (): Promise<void> => {
    await plugin.shutdown?.();
  });
  // Contributors may register after Studio, but before the finalization barrier.
  cleanups.push(await installContributors(shell, ["note", "post", "image"]));
  await plugin.finalizeRegistration?.();
  await service.reprojectRegisteredGroupings();
  const routes = plugin.getWebRoutes?.() ?? [];
  const dispatch = async (
    request: Request,
    role: string,
  ): Promise<Response> => {
    request.headers.set("Cookie", cookies.get(role) ?? "");
    request.headers.set("Origin", "https://studio.test");
    const route = routes.find(
      (entry) =>
        entry.path === new URL(request.url).pathname &&
        entry.method === request.method,
    );
    if (!route) throw new Error("Missing production route");
    return route.handler(request);
  };
  return {
    service,
    databaseUrl: dbConfig.url,
    api: (role = "admin"): StudioApi =>
      new StudioApi({
        basePath: base,
        fetch: async (input, init): Promise<Response> =>
          dispatch(
            new Request(new URL(String(input), "https://studio.test"), init),
            role,
          ),
      }),
    request: (method, path, body, role = "admin"): Promise<Response> =>
      dispatch(
        new Request(`https://studio.test${base}/api/${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        role,
      ),
  };
}

test("preview image reads require a session and cannot widen its visibility scope", async () => {
  const runtime = await fixture();
  const dataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  await runtime.service.createEntity({
    entity: {
      id: "private-image",
      visibility: "public",
      entityType: "image",
      content: dataUrl,
      metadata: imageMetadataFor(dataUrl, { title: "Private image" }),
    },
  });
  // Set the fixture row's system visibility without rewriting binary content
  // through Markdown serialization; preview admission must use the row scope.
  const database = createClient({ url: runtime.databaseUrl });
  try {
    await database.execute({
      sql: "UPDATE entities SET visibility = ? WHERE entityType = ? AND id = ?",
      args: ["restricted", "image", "private-image"],
    });
  } finally {
    database.close();
  }
  const denied = await runtime.request(
    "GET",
    "images?id=private-image&visibilityScope=restricted",
    undefined,
    "trusted",
  );
  const missing = await runtime.request(
    "GET",
    "images?id=missing",
    undefined,
    "trusted",
  );
  expect(denied.status).toBe(404);
  expect(missing.status).toBe(404);
  expect(await denied.json()).toEqual(await missing.json());
  const allowed = await runtime.request("GET", "images?id=private-image");
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("Cache-Control")).toBe("no-store");
  expect(await allowed.json()).toEqual({ source: dataUrl });
  expect(
    (
      await runtime.request(
        "GET",
        "images?id=private-image",
        undefined,
        "anonymous",
      )
    ).status,
  ).toBe(401);
  expect((await runtime.request("GET", "images")).status).toBe(400);
  expect(
    (await runtime.request("GET", "entities?type=image&id=private-image"))
      .status,
  ).toBe(404);
});

test("member editing preserves image-like memberships, unclaimed fields and authored body references", async () => {
  const runtime = await fixture();
  const literal = "![Literal](entity://image/reference)";
  const dataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  await runtime.service.createEntity({
    entity: {
      id: "reference",
      entityType: "image",
      content: dataUrl,
      metadata: imageMetadataFor(dataUrl, { title: "Reference" }),
      visibility: "public",
    },
  });
  expect(
    (
      await runtime.service.getEntityRaw({
        entityType: "image",
        id: "reference",
        visibilityScope: "shared",
      })
    )?.content,
  ).toBe(dataUrl);
  await define(runtime, {
    clients: {
      label: "Clients",
      multiple: true,
      values: [literal],
    },
  });
  const body = "Body image: ![Body](entity://image/reference)";
  for (const entityType of ["note", "post"]) {
    await runtime.service.createEntityFromMarkdown({
      input: {
        entityType,
        id: "literal-member",
        visibility: "shared",
        markdown: `---\ntitle: Literal member\nslug: literal-member\nstatus: draft\nexcerpt: Literal excerpt\nauthor: Test author\nclients: [${JSON.stringify(literal)}]\nunclaimed: ${JSON.stringify(literal)}\n---\n\n${body}`,
      },
    });
    const rendered = await runtime.service.getEntity({
      entityType,
      id: "literal-member",
      visibilityScope: "shared",
    });
    expect(rendered?.content).toContain(dataUrl);
    const detail = await runtime
      .api()
      .fetchEntity(entityType, "literal-member");
    expect(detail.frontmatter["clients"]).toEqual([literal]);
    expect(detail.frontmatter["unclaimed"]).toBe(literal);
    expect(detail.body).toBe(body);
    const { unclaimed: _unclaimed, ...fields } = detail.frontmatter;
    expect(
      (
        await runtime.request("PUT", "entities", {
          entityType,
          id: "literal-member",
          frontmatter: { ...fields, title: "Edited title" },
          body: detail.body,
          baseContentHash: detail.contentHash,
        })
      ).status,
    ).toBe(200);
    const stored = await runtime.service.getEntityRaw({
      entityType,
      id: "literal-member",
      visibilityScope: "shared",
    });
    expect(stored).not.toBeNull();
    if (!stored) throw new Error("Missing saved member");
    const source = parseMarkdown(stored.content, { cache: false });
    expect(source.frontmatter["clients"]).toEqual([literal]);
    expect(source.frontmatter["unclaimed"]).toBe(literal);
    expect(source.content).toBe(body);
  }
  const ui = await mountStudio(
    runtime.api(),
    `${base}/entities/note/literal-member`,
    base,
  );
  try {
    await waitForStudio(
      () =>
        document.querySelector('form[aria-label="Document editor"]') !== null,
    );
    await ui.click("Preview");
    await waitForStudio(
      () => document.querySelector("[data-studio-preview] img") !== null,
    );
    expect(
      document.querySelector("[data-studio-preview] img")?.getAttribute("src"),
    ).toBe(dataUrl);
    expect(
      document.querySelector("[data-grouping-member]")?.textContent,
    ).toContain(literal);
    await ui.input("Title", "Preview-safe edit");
    await ui.click("Save changes");
    await waitForStudio(() =>
      document.body.textContent.includes("Saved through the entity service."),
    );
    const saved = await runtime.service.getEntityRaw({
      entityType: "note",
      id: "literal-member",
      visibilityScope: "shared",
    });
    expect(saved).not.toBeNull();
    if (!saved) throw new Error("Missing preview-edited member");
    // The declarative Note codec separates owned title metadata from content.
    // Check both its canonical field and the actual persisted Markdown.
    expect(saved.metadata["title"]).toBe("Preview-safe edit");
    const database = createClient({ url: runtime.databaseUrl });
    try {
      const result = await database.execute({
        sql: "SELECT content FROM entities WHERE entityType = ? AND id = ?",
        args: ["note", "literal-member"],
      });
      const storedSource = z.string().parse(result.rows[0]?.["content"]);
      expect(
        parseMarkdown(storedSource, { cache: false }).frontmatter["title"],
      ).toBe("Preview-safe edit");
    } finally {
      database.close();
    }
    expect(parseMarkdown(saved.content, { cache: false }).content).toBe(body);
    expect(
      parseMarkdown(saved.content, { cache: false }).frontmatter["clients"],
    ).toEqual([literal]);
  } finally {
    await ui.close();
  }
});

const clients = {
  label: "Clients",
  multiple: false,
  values: ["Acme", "Beta"],
};
async function define(
  runtime: Awaited<ReturnType<typeof fixture>>,
  groupings: GroupingDefinitionsFrontmatter["groupings"],
  method = "POST",
): Promise<void> {
  expect(
    (
      await runtime.request(method, "entities", {
        entityType: type,
        id: type,
        frontmatter: { groupings },
      })
    ).status,
  ).toBe(method === "POST" ? 201 : 200);
}

// These use production registration and real sessions; only HTTP transport is
// injected. They are not a substitute for running-app/browser acceptance.
test("production source creation refreshes a cached Note schema and supplies open single-value rules", async () => {
  const runtime = await fixture();
  await runtime.service.createEntityFromMarkdown({
    input: {
      entityType: "note",
      id: "existing",
      markdown: "---\ntitle: Existing\nareas: [Fieldwork]\n---\n\nBody",
    },
  });
  const before = await runtime.service.getEntityRaw({
    entityType: "note",
    id: "existing",
  });
  expect(before).not.toBeNull();
  const ui = await mountStudio(
    runtime.api(),
    `${base}/entities/note/existing`,
    base,
  );
  try {
    await waitForStudio(
      () =>
        document.querySelector('form[aria-label="Document editor"]') !== null,
    );
    expect(
      document.querySelector('[data-studio-field="grouping-membership"]'),
    ).toBeNull();
    await act(async () => ui.history.push(`${base}/entities/${type}`));
    await waitForStudio(() =>
      document.body.textContent.includes("Your first grouping"),
    );
    expect(
      document.querySelector<HTMLButtonElement>(
        'form[aria-label="Document editor"] button[type=submit]',
      )?.disabled,
    ).toBe(true);
    await ui.click("Add grouping");
    await ui.input("New grouping label", "Research areas");
    await ui.input("Research areas key", "areas");
    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Research areas values per entry"]',
    );
    if (!select) throw new Error("Missing cardinality control");
    await act(async () => {
      select.value = "one";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await ui.click("Save changes");
    await waitForStudio(
      () =>
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Research areas key"]',
        )?.readOnly === true,
    );
    expect(
      (
        await runtime.service.getEntityRaw({
          entityType: "note",
          id: "existing",
        })
      )?.content,
    ).toBe(before?.content);
    expect(await (await runtime.request("GET", "types")).json()).toMatchObject({
      groupings: [
        {
          key: "areas",
          field: "areas",
          types: ["note", "post"],
          rules: { multiple: false },
        },
      ],
    });
    await act(async () => ui.history.push(`${base}/entities/note/existing`));
    await waitForStudio(
      () =>
        document.querySelector('[data-studio-field="grouping-membership"]') !==
        null,
    );
    expect(
      document.querySelector('[data-studio-field="grouping-membership"]')
        ?.textContent,
    ).toContain("one");
    await ui.input("Replace Research areas value", " Ka21 ");
    await ui.click("Replace value");
    await ui.click("Save changes");
    await waitForStudio(() => document.body.textContent.includes("Saved"));
    const saved = await runtime.service.getEntityRaw({
      entityType: "note",
      id: "existing",
    });
    expect(parseMarkdown(saved?.content ?? "").frontmatter["areas"]).toEqual([
      " Ka21 ",
    ]);
  } finally {
    await ui.close();
  }
});

test("production descriptors cover all four rules and the admin floor survives permissive instance policy", async () => {
  const runtime = await fixture();
  await define(runtime, {
    clients,
    projects: {
      label: "Projects",
      excludeTypes: ["post"],
      multiple: true,
      values: ["Launch", "Rebrand"],
    },
    areas: { label: "Areas", excludeTypes: ["post"], multiple: false },
    topics: { label: "Topics", excludeTypes: ["post"], multiple: true },
  });
  expect(
    await (await runtime.request("GET", "types", undefined, "trusted")).json(),
  ).toMatchObject({
    groupings: [
      { key: "clients", rules: { multiple: false, values: ["Acme", "Beta"] } },
      {
        key: "projects",
        rules: { multiple: true, values: ["Launch", "Rebrand"] },
      },
      { key: "areas", rules: { multiple: false } },
      { key: "topics", rules: { multiple: true } },
    ],
  });
  expect(
    (
      await runtime.request(
        "PUT",
        "entities",
        { entityType: type, id: type, frontmatter: { groupings: {} } },
        "trusted",
      )
    ).status,
  ).toBe(403);
  expect(
    (await runtime.request("GET", "schema?type=grouping-vocabulary")).status,
  ).toBe(404);
  const ui = await mountStudio(
    runtime.api("trusted"),
    `${base}/entities/${type}`,
    base,
  );
  try {
    await waitForStudio(
      () =>
        document.querySelector('[aria-label="Grouping definitions"]') !== null,
    );
    expect(
      document.querySelector('[aria-label="Grouping definitions"]')
        ?.textContent,
    ).toContain("Clients");
    expect(
      document.querySelectorAll(
        '[aria-label="Grouping definitions"] button, [aria-label="Grouping definitions"] input, [aria-label="Grouping definitions"] select',
      ),
    ).toHaveLength(0);
  } finally {
    await ui.close();
  }
});

test("a refused member save refreshes current rules without discarding its local draft", async () => {
  const runtime = await fixture();
  await define(runtime, { clients });
  await runtime.service.createEntityFromMarkdown({
    input: {
      entityType: "note",
      id: "existing",
      markdown: "---\ntitle: Existing\nclients: [Acme]\n---\n\nBody",
    },
  });
  const before = await runtime.service.getEntityRaw({
    entityType: "note",
    id: "existing",
  });
  expect(before).not.toBeNull();
  const ui = await mountStudio(
    runtime.api("trusted"),
    `${base}/entities/note/existing`,
    base,
  );
  try {
    await waitForStudio(
      () =>
        document.querySelector('select[aria-label="Replace Clients value"]') !==
        null,
    );
    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Replace Clients value"]',
    );
    if (!select) throw new Error("Missing membership control");
    await act(async () => {
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await define(runtime, { clients: { ...clients, values: ["Acme"] } }, "PUT");
    await ui.click("Save changes");
    await waitForStudio(() =>
      document.body.textContent.includes(
        "choose values from the configured list",
      ),
    );
    await waitForStudio(
      () =>
        document
          .querySelector('[data-studio-field="grouping-membership"]')
          ?.textContent.includes("not in list") === true,
    );
    expect(
      document.querySelector('[data-studio-field="grouping-membership"]')
        ?.textContent,
    ).toContain("Beta");
    expect(
      await runtime.service.getEntityRaw({
        entityType: "note",
        id: "existing",
      }),
    ).toEqual(before);
  } finally {
    await ui.close();
  }
});
