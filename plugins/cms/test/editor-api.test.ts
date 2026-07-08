import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { BaseEntity, WebRouteDefinition } from "@brains/plugins";
import { BaseEntityAdapter, baseEntitySchema } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { cmsPlugin, type CmsPlugin } from "../src";

const postFrontmatterSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  published: z.boolean().optional(),
});

const siteInfoFrontmatterSchema = z.object({
  siteName: z.string(),
  tagline: z.string().optional(),
});

// Mirrors the real note frontmatter schema: system bookkeeping fields that
// must never surface as authoring form fields — notes are raw markdown.
const noteFrontmatterSchema = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

const frontmatterSchemas: Record<string, z.ZodObject<z.ZodRawShape>> = {
  post: postFrontmatterSchema,
  "site-info": siteInfoFrontmatterSchema,
  note: noteFrontmatterSchema,
};

class TestAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(options: {
    entityType: string;
    frontmatterSchema: z.ZodObject<z.ZodRawShape>;
    isSingleton?: boolean;
    hasBody?: boolean;
  }) {
    super({
      entityType: options.entityType,
      purpose: `${options.entityType} test entities`,
      schema: baseEntitySchema,
      frontmatterSchema: options.frontmatterSchema,
      ...(options.isSingleton !== undefined && {
        isSingleton: options.isSingleton,
      }),
      ...(options.hasBody !== undefined && { hasBody: options.hasBody }),
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { entityType: this.entityType, content: markdown };
  }

  // Store exactly what the editor wrote — keeps assertions byte-precise
  // and matches raw-note semantics.
  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }
}

function createEditorTestShell(): MockShell {
  const shell = createMockShell({ domain: "yeehaa.io" });
  shell.getMessageBus().subscribe("git-sync:get-repo-info", async () => ({
    success: true,
    data: { repo: "owner/repo", branch: "main" },
  }));

  const registry = shell.getEntityRegistry();
  registry.registerEntityType(
    "post",
    baseEntitySchema,
    new TestAdapter({
      entityType: "post",
      frontmatterSchema: postFrontmatterSchema,
      isSingleton: false,
      hasBody: true,
    }),
  );
  registry.registerEntityType(
    "site-info",
    baseEntitySchema,
    new TestAdapter({
      entityType: "site-info",
      frontmatterSchema: siteInfoFrontmatterSchema,
      isSingleton: true,
      hasBody: false,
    }),
  );
  registry.registerEntityType(
    "note",
    baseEntitySchema,
    new TestAdapter({
      entityType: "note",
      frontmatterSchema: noteFrontmatterSchema,
      isSingleton: false,
      hasBody: true,
    }),
  );
  registry.getEffectiveFrontmatterSchema = (
    type: string,
  ): z.ZodObject<z.ZodRawShape> | undefined => frontmatterSchemas[type];

  return shell;
}

async function seedPost(
  shell: MockShell,
  overrides: { id?: string; title?: string; body?: string } = {},
): Promise<string> {
  const id = overrides.id ?? "hello-world";
  const title = overrides.title ?? "Hello World";
  const body = overrides.body ?? "The original body.";
  await shell.getEntityService().createEntity({
    entity: {
      id,
      entityType: "post",
      content: `---\ntitle: ${title}\n---\n\n${body}\n`,
      metadata: { title },
      visibility: "public",
      created: "2026-07-01T00:00:00.000Z",
      updated: "2026-07-01T00:00:00.000Z",
    },
  });
  return id;
}

async function createSessionCookie(shell: MockShell): Promise<string> {
  const authPlugin = new AuthServicePlugin({
    storageDir: await mkdtemp(join(tmpdir(), "brains-cms-editor-auth-")),
  });
  await authPlugin.register(shell);
  const session = await authPlugin.getService().createOperatorSession();
  return session.cookie;
}

async function registerPlugin(shell: MockShell): Promise<CmsPlugin> {
  const plugin = cmsPlugin();
  await plugin.register(shell);
  return plugin;
}

function findRoute(
  plugin: CmsPlugin,
  path: string,
  method: WebRouteDefinition["method"] = "GET",
): WebRouteDefinition {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) =>
        candidate.path === path && (candidate.method ?? "GET") === method,
    );
  expect(route).toBeDefined();
  return route as WebRouteDefinition;
}

function apiRequest(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown } = {},
): Request {
  return new Request(`https://yeehaa.io${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
}

function uploadRequest(
  options: { cookie?: string; file?: File } = {},
): Request {
  const form = new FormData();
  if (options.file) form.set("file", options.file);
  return new Request("https://yeehaa.io/cms/api/upload", {
    method: "POST",
    headers: options.cookie ? { Cookie: options.cookie } : {},
    body: form,
  });
}

describe("cms editor uploads", () => {
  const pngFile = (): File =>
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", {
      type: "image/png",
    });

  it("requires an operator session", async () => {
    const shell = createEditorTestShell();
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/upload", "POST").handler(
      uploadRequest({ file: pngFile() }),
    );

    expect(response.status).toBe(401);
  });

  it("promotes an uploaded image through the registered upload-save handler", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const seen: Array<{ kind: string; id: string }> = [];
    shell.getEntityRegistry().registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/*"],
      handler: async (input) => {
        seen.push(input.upload);
        return {
          success: true,
          data: { entityId: "image-42", status: "created" },
        };
      },
    });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/upload", "POST").handler(
      uploadRequest({ cookie, file: pngFile() }),
    );
    const payload = (await response.json()) as { entityId: string };

    expect(response.status).toBe(201);
    expect(payload.entityId).toBe("image-42");
    // The handler received a runtime-upload reference, not raw bytes.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.kind).toBe("upload");
    expect(seen[0]?.id.length).toBeGreaterThan(0);
  });

  it("rejects media types no handler claims", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/upload", "POST").handler(
      uploadRequest({
        cookie,
        file: new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" }),
      }),
    );

    expect(response.status).toBe(415);
  });

  it("rejects uploads without a file", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/upload", "POST").handler(
      uploadRequest({ cookie }),
    );

    expect(response.status).toBe(400);
  });
});

describe("cms editor shell", () => {
  it("redirects to operator login without a session", async () => {
    const shell = createEditorTestShell();
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms").handler(
      apiRequest("/cms"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?return_to=%2Fcms");
  });

  it("serves the editor shell with an operator session", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms").handler(
      apiRequest("/cms", { cookie }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("/cms/assets/app.js");
    expect(html).not.toContain("sveltia");
  });

  it("registers the editor asset route", async () => {
    const shell = createEditorTestShell();
    const plugin = await registerPlugin(shell);

    // The bundle may not be built when tests run; the route must exist and
    // either serve JS or answer 404, never throw.
    const response = await findRoute(plugin, "/cms/assets/app.js").handler(
      apiRequest("/cms/assets/app.js"),
    );
    expect([200, 404]).toContain(response.status);
  });
});

describe("cms editor api", () => {
  it("rejects every api route without an operator session", async () => {
    const shell = createEditorTestShell();
    await seedPost(shell);
    const plugin = await registerPlugin(shell);

    const attempts: Array<[WebRouteDefinition, Request]> = [
      [findRoute(plugin, "/cms/api/types"), apiRequest("/cms/api/types")],
      [
        findRoute(plugin, "/cms/api/schema"),
        apiRequest("/cms/api/schema?type=post"),
      ],
      [
        findRoute(plugin, "/cms/api/entities"),
        apiRequest("/cms/api/entities?type=post"),
      ],
      [
        findRoute(plugin, "/cms/api/entities", "PUT"),
        apiRequest("/cms/api/entities", {
          method: "PUT",
          body: {
            entityType: "post",
            id: "hello-world",
            frontmatter: { title: "X" },
          },
        }),
      ],
      [
        findRoute(plugin, "/cms/api/entities", "POST"),
        apiRequest("/cms/api/entities", {
          method: "POST",
          body: { entityType: "post", frontmatter: { title: "X" } },
        }),
      ],
      [
        findRoute(plugin, "/cms/api/entities", "DELETE"),
        apiRequest("/cms/api/entities?type=post&id=hello-world", {
          method: "DELETE",
        }),
      ],
    ];

    for (const [route, request] of attempts) {
      const response = await route.handler(request);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "Operator session required",
      });
    }
  });

  it("lists entity types with adapter flags", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/types").handler(
      apiRequest("/cms/api/types", { cookie }),
    );
    const payload = (await response.json()) as {
      types: Array<{
        entityType: string;
        label: string;
        isSingleton: boolean;
        hasBody: boolean;
        count: number;
      }>;
    };

    expect(response.status).toBe(200);
    const post = payload.types.find((t) => t.entityType === "post");
    expect(post).toEqual({
      entityType: "post",
      label: "Posts",
      isSingleton: false,
      hasBody: true,
      count: 1,
    });
  });

  it("honours entityDisplay overrides in type labels", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = cmsPlugin({ entityDisplay: { post: { label: "Essay" } } });
    await plugin.register(shell);

    const response = await findRoute(plugin, "/cms/api/types").handler(
      apiRequest("/cms/api/types", { cookie }),
    );
    const payload = (await response.json()) as {
      types: Array<{ entityType: string; label: string }>;
    };

    expect(payload.types.find((t) => t.entityType === "post")?.label).toBe(
      "Essays",
    );
  });

  it("returns field descriptors for a type", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/schema").handler(
      apiRequest("/cms/api/schema?type=post", { cookie }),
    );
    const payload = (await response.json()) as {
      entityType: string;
      isSingleton: boolean;
      hasBody: boolean;
      fields: Array<{
        name: string;
        label: string;
        widget: string;
        required?: boolean;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.entityType).toBe("post");
    expect(payload.isSingleton).toBe(false);
    expect(payload.hasBody).toBe(true);
    expect(payload.fields).toEqual([
      { name: "title", label: "Title", widget: "string" },
      { name: "summary", label: "Summary", widget: "text", required: false },
      {
        name: "published",
        label: "Published",
        widget: "boolean",
        required: false,
      },
    ]);
  });

  it("treats base notes as raw markdown with no frontmatter form", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/schema").handler(
      apiRequest("/cms/api/schema?type=note", { cookie }),
    );
    const payload = (await response.json()) as {
      format: string;
      hasBody: boolean;
      fields: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.format).toBe("raw");
    expect(payload.hasBody).toBe(true);
    // The note frontmatter schema (title/status/error bookkeeping) must not
    // leak into the authoring form.
    expect(payload.fields).toEqual([]);
  });

  it("round-trips a raw note verbatim, even when it opens with a horizontal rule", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    // A leading --- here is a markdown horizontal rule, not frontmatter.
    const content = "---\n\nStarts with a rule.\n\n---\n\nEnds with one.\n";
    await shell.getEntityService().createEntity({
      entity: {
        id: "rule-note",
        entityType: "note",
        content,
        metadata: {},
        visibility: "public",
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-01T00:00:00.000Z",
      },
    });
    const plugin = await registerPlugin(shell);

    const readBack = await findRoute(plugin, "/cms/api/entities").handler(
      apiRequest("/cms/api/entities?type=note&id=rule-note", { cookie }),
    );
    const payload = (await readBack.json()) as {
      entity: { frontmatter: Record<string, unknown>; body: string };
    };
    expect(payload.entity.frontmatter).toEqual({});
    expect(payload.entity.body).toBe(content);

    const newBody = "Rewritten.\n\n---\n\nStill raw.\n";
    const update = await findRoute(plugin, "/cms/api/entities", "PUT").handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "note",
          id: "rule-note",
          frontmatter: {},
          body: newBody,
        },
      }),
    );
    expect(update.status).toBe(200);

    const stored = await shell.getEntityService().getEntity({
      entityType: "note",
      id: "rule-note",
    });
    expect(stored?.content).toBe(newBody);
  });

  it("rejects frontmatter writes to raw types", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await shell.getEntityService().createEntity({
      entity: {
        id: "plain-note",
        entityType: "note",
        content: "Just text.\n",
        metadata: {},
        visibility: "public",
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-01T00:00:00.000Z",
      },
    });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "PUT",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "note",
          id: "plain-note",
          frontmatter: { title: "Sneaky" },
          body: "Just text.\n",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects schema requests for unknown types", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/schema").handler(
      apiRequest("/cms/api/schema?type=mystery", { cookie }),
    );

    expect(response.status).toBe(404);
  });

  it("lists entities of a type with their frontmatter", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "first-post", title: "First Post" });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/entities").handler(
      apiRequest("/cms/api/entities?type=post", { cookie }),
    );
    const payload = (await response.json()) as {
      entities: Array<{
        id: string;
        entityType: string;
        frontmatter: Record<string, unknown>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.entities).toHaveLength(1);
    expect(payload.entities[0]?.id).toBe("first-post");
    expect(payload.entities[0]?.entityType).toBe("post");
    expect(payload.entities[0]?.frontmatter["title"]).toBe("First Post");
  });

  it("returns the content hash so edits can carry a precondition", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world" });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/entities").handler(
      apiRequest("/cms/api/entities?type=post&id=hello-world", { cookie }),
    );
    const payload = (await response.json()) as {
      entity: { contentHash: string };
    };

    expect(payload.entity.contentHash.length).toBeGreaterThan(0);
  });

  it("rejects a stale write when the entity changed under the editor", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world", title: "Hello World" });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "PUT",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "post",
          id: "hello-world",
          frontmatter: { title: "Overwrites concurrent edit" },
          baseContentHash: "hash-of-a-version-that-no-longer-exists",
        },
      }),
    );

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("changed");

    // The stale write must not land.
    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: "hello-world",
    });
    expect(stored?.content).toContain("title: Hello World");
  });

  it("accepts a write whose precondition matches the stored version", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world", title: "Hello World" });
    const plugin = await registerPlugin(shell);

    const read = await findRoute(plugin, "/cms/api/entities").handler(
      apiRequest("/cms/api/entities?type=post&id=hello-world", { cookie }),
    );
    const { entity } = (await read.json()) as {
      entity: { contentHash: string };
    };

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "PUT",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "post",
          id: "hello-world",
          frontmatter: { title: "Fresh Edit" },
          baseContentHash: entity.contentHash,
        },
      }),
    );

    expect(response.status).toBe(200);
    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: "hello-world",
    });
    expect(stored?.content).toContain("title: Fresh Edit");
  });

  it("returns a single entity with frontmatter and body split", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, {
      id: "hello-world",
      title: "Hello World",
      body: "The original body.",
    });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/entities").handler(
      apiRequest("/cms/api/entities?type=post&id=hello-world", { cookie }),
    );
    const payload = (await response.json()) as {
      entity: {
        id: string;
        entityType: string;
        frontmatter: Record<string, unknown>;
        body: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.entity.id).toBe("hello-world");
    expect(payload.entity.frontmatter).toEqual({ title: "Hello World" });
    expect(payload.entity.body.trim()).toBe("The original body.");
  });

  it("returns 404 for a missing entity", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/entities").handler(
      apiRequest("/cms/api/entities?type=post&id=nope", { cookie }),
    );

    expect(response.status).toBe(404);
  });

  it("updates frontmatter through the entity service and preserves the body", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, {
      id: "hello-world",
      title: "Hello World",
      body: "The original body.",
    });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "PUT",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "post",
          id: "hello-world",
          frontmatter: { title: "Hello Again", summary: "Now with summary" },
        },
      }),
    );
    const payload = (await response.json()) as { entityId: string };

    expect(response.status).toBe(200);
    expect(payload.entityId).toBe("hello-world");

    // The write must be observable through the entity service.
    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: "hello-world",
    });
    expect(stored?.content).toContain("title: Hello Again");
    expect(stored?.content).toContain("summary: Now with summary");
    expect(stored?.content).toContain("The original body.");
  });

  it("round-trips body and frontmatter together on update", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, {
      id: "hello-world",
      title: "Hello World",
      body: "The original body.",
    });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "PUT",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "post",
          id: "hello-world",
          frontmatter: { title: "Hello Body" },
          body: "A **rewritten** body.\n\nWith two paragraphs.",
        },
      }),
    );

    expect(response.status).toBe(200);

    const readBack = await findRoute(plugin, "/cms/api/entities").handler(
      apiRequest("/cms/api/entities?type=post&id=hello-world", { cookie }),
    );
    const payload = (await readBack.json()) as {
      entity: { frontmatter: Record<string, unknown>; body: string };
    };
    expect(payload.entity.frontmatter).toEqual({ title: "Hello Body" });
    expect(payload.entity.body).toBe(
      "A **rewritten** body.\n\nWith two paragraphs.",
    );
  });

  it("rejects a body for entity types without one", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await shell.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: "---\nsiteName: Rover\n---\n",
        metadata: {},
        visibility: "public",
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-01T00:00:00.000Z",
      },
    });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "PUT",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "site-info",
          id: "site-info",
          frontmatter: { siteName: "Rover" },
          body: "This type has no body.",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects frontmatter that fails schema validation before writing", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world", title: "Hello World" });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "PUT",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "post",
          id: "hello-world",
          // title is required by the schema
          frontmatter: { summary: "no title" },
        },
      }),
    );

    expect(response.status).toBe(400);

    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: "hello-world",
    });
    expect(stored?.content).toContain("title: Hello World");
  });

  it("creates an entity with a server-derived id", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "POST",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "POST",
        body: {
          entityType: "post",
          frontmatter: { title: "Fresh Post" },
          body: "First draft.",
        },
      }),
    );
    const payload = (await response.json()) as { entityId: string };

    expect(response.status).toBe(201);
    expect(payload.entityId.length).toBeGreaterThan(0);

    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: payload.entityId,
    });
    expect(stored?.content).toContain("title: Fresh Post");
    expect(stored?.content).toContain("First draft.");
  });

  it("rejects creates that fail schema validation before writing", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "POST",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "POST",
        // title is required by the schema
        body: { entityType: "post", frontmatter: { summary: "no title" } },
      }),
    );

    expect(response.status).toBe(400);
    const listed = await shell
      .getEntityService()
      .listEntities({ entityType: "post" });
    expect(listed).toHaveLength(0);
  });

  it("rejects creates for unknown entity types", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "POST",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "POST",
        body: { entityType: "mystery", frontmatter: { title: "X" } },
      }),
    );

    expect(response.status).toBe(404);
  });

  it("deletes an entity through the entity service", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "doomed", title: "Doomed" });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "DELETE",
    ).handler(
      apiRequest("/cms/api/entities?type=post&id=doomed", {
        cookie,
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });

    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: "doomed",
    });
    expect(stored).toBeNull();
  });

  it("returns 404 when deleting a missing entity", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "DELETE",
    ).handler(
      apiRequest("/cms/api/entities?type=post&id=ghost", {
        cookie,
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(404);
  });

  it("reports singleton types with their adapter flags", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/types").handler(
      apiRequest("/cms/api/types", { cookie }),
    );
    const payload = (await response.json()) as {
      types: Array<{
        entityType: string;
        isSingleton: boolean;
        hasBody: boolean;
      }>;
    };

    const siteInfo = payload.types.find((t) => t.entityType === "site-info");
    expect(siteInfo).toMatchObject({ isSingleton: true, hasBody: false });
  });

  it("serves the singleton record through the same entity endpoints", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await shell.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: "---\nsiteName: Rover\n---\n",
        metadata: {},
        visibility: "public",
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-01T00:00:00.000Z",
      },
    });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/cms/api/entities").handler(
      apiRequest("/cms/api/entities?type=site-info", { cookie }),
    );
    const payload = (await response.json()) as {
      entities: Array<{ id: string; frontmatter: Record<string, unknown> }>;
    };

    expect(response.status).toBe(200);
    expect(payload.entities).toHaveLength(1);
    expect(payload.entities[0]?.frontmatter["siteName"]).toBe("Rover");
  });

  it("returns 404 when updating a missing entity", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/cms/api/entities",
      "PUT",
    ).handler(
      apiRequest("/cms/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "post",
          id: "ghost",
          frontmatter: { title: "Ghost" },
        },
      }),
    );

    expect(response.status).toBe(404);
  });
});
