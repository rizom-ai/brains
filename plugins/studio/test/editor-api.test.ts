import { join } from "node:path";
import { createTempDataDir } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type {
  BaseEntity,
  RegisteredWebRoute,
  WebRouteDefinition,
} from "@brains/plugins";
import { BaseEntityAdapter, baseEntitySchema } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { studioPlugin, type StudioPlugin } from "../src";

const postFrontmatterSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
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

// Derived, restricted types (mail-item is the shipped example) declare strict
// frontmatter, so any stray key is a hard rejection rather than a silent strip.
const briefFrontmatterSchema = z.strictObject({ title: z.string() });

const frontmatterSchemas: Record<string, z.ZodObject<z.ZodRawShape>> = {
  post: postFrontmatterSchema,
  "site-info": siteInfoFrontmatterSchema,
  note: noteFrontmatterSchema,
  brief: briefFrontmatterSchema,
};

const adminVisibilityField = {
  name: "visibility",
  label: "Visibility",
  widget: "select",
  required: true,
  default: "public",
  options: ["public", "shared", "restricted"],
};

const entityIdPayloadSchema = z.object({ entityId: z.string() });
const suggestionPayloadSchema = z.object({ suggestion: z.string() });
const skippedPayloadSchema = z.object({ skipped: z.boolean() });
const entityPayloadSchema = z.object({
  entity: z.object({
    id: z.string(),
    entityType: z.string(),
    frontmatter: z.record(z.string(), z.unknown()),
    body: z.string(),
    contentHash: z.string(),
  }),
});
const entityListPayloadSchema = z.object({
  entities: z.array(
    z.object({
      id: z.string(),
      entityType: z.string().optional(),
      frontmatter: z.record(z.string(), z.unknown()),
    }),
  ),
});
const typeListPayloadSchema = z.object({
  types: z.array(
    z.looseObject({
      entityType: z.string(),
      label: z.string().optional(),
      isSingleton: z.boolean(),
      hasBody: z.boolean(),
      count: z.number().optional(),
      capabilities: z.record(z.string(), z.boolean()).optional(),
    }),
  ),
});
const syncStatusPayloadSchema = z.object({
  directorySync: z.unknown(),
  git: z.unknown(),
});

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
  registry.registerEntityType(
    "brief",
    baseEntitySchema,
    new TestAdapter({
      entityType: "brief",
      frontmatterSchema: briefFrontmatterSchema,
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
    storageDir: await createTempDataDir("brains-studio-editor-auth-"),
  });
  await authPlugin.register(shell);
  const session = await authPlugin.getService().createAuthSession();
  return session.cookie;
}

async function registerPlugin(shell: MockShell): Promise<StudioPlugin> {
  const plugin = studioPlugin();
  await plugin.register(shell);
  return plugin;
}

function findRoute(
  plugin: StudioPlugin,
  path: string,
  method: WebRouteDefinition["method"] = "GET",
): WebRouteDefinition {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) =>
        candidate.path === path && (candidate.method ?? "GET") === method,
    );
  if (!route) throw new Error(`Missing ${method} route: ${path}`);
  return route;
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
        ? {
            "Content-Type": "application/json",
            Origin: "https://yeehaa.io",
          }
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
  return new Request("https://yeehaa.io/studio/api/upload", {
    method: "POST",
    headers: options.cookie
      ? { Cookie: options.cookie, Origin: "https://yeehaa.io" }
      : {},
    body: form,
  });
}

describe("studio editor uploads", () => {
  const pngFile = (): File =>
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", {
      type: "image/png",
    });

  it("requires an auth session", async () => {
    const shell = createEditorTestShell();
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/studio/api/upload",
      "POST",
    ).handler(uploadRequest({ file: pngFile() }));

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

    const response = await findRoute(
      plugin,
      "/studio/api/upload",
      "POST",
    ).handler(uploadRequest({ cookie, file: pngFile() }));
    const payload = entityIdPayloadSchema.parse(await response.json());

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

    const response = await findRoute(
      plugin,
      "/studio/api/upload",
      "POST",
    ).handler(
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

    const response = await findRoute(
      plugin,
      "/studio/api/upload",
      "POST",
    ).handler(uploadRequest({ cookie }));

    expect(response.status).toBe(400);
  });
});

describe("studio editor shell", () => {
  it("redirects to passkey login without a session", async () => {
    const shell = createEditorTestShell();
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio").handler(
      apiRequest("/studio"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?return_to=%2Fstudio");
  });

  it("serves the editor shell with an auth session", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio").handler(
      apiRequest("/studio", { cookie }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("/studio/assets/app.js");
    expect(html).toContain('data-studio-base-path="/studio"');
    expect(html).not.toContain("sveltia");
  });

  it("serves native Studio Chat at the canonical /chat URL without redirecting", async () => {
    const shell = createEditorTestShell();
    const getPluginWebRoutes = shell.getPluginWebRoutes.bind(shell);
    shell.getPluginWebRoutes = (): RegisteredWebRoute[] => [
      ...getPluginWebRoutes(),
      {
        pluginId: "web-chat",
        fullPath: "/api/chat",
        definition: {
          path: "/api/chat",
          method: "POST",
          public: true,
          handler: (_request: Request): Response => new Response(),
        },
      },
      {
        pluginId: "web-chat",
        fullPath: "/api/chat/actions",
        definition: {
          path: "/api/chat/actions",
          method: "POST",
          public: true,
          handler: (_request: Request): Response => new Response(),
        },
      },
    ];
    shell.addPlugin({
      id: "web-chat",
      version: "0.0.0-test",
      type: "interface",
      packageName: "@brains/web-chat",
      register: async () => ({ tools: [], resources: [] }),
    });
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/chat").handler(
      apiRequest("/chat?session=thread-1", { cookie }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(html).toContain("/studio/assets/app.js");
    expect(html).toContain('data-studio-base-path="/studio"');
    expect(html).toContain('data-console-surface="web-chat"');
    expect(html).toContain(
      'href="/logout?return_to=%2Fchat%3Fsession%3Dthread-1"',
    );
  });

  it("serves the Account view inside the shell to an active Public session", async () => {
    const shell = createEditorTestShell();
    const authPlugin = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-studio-account-view-"),
    });
    await authPlugin.register(shell);
    const person = await authPlugin.getService().createUser({
      displayName: "Public account holder",
      role: "public",
      status: "active",
    });
    const session = await authPlugin
      .getService()
      .createAuthSession(person.userId);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/workspaces").handler(
      apiRequest("/studio/workspaces/studio%3Aaccount", {
        cookie: session.cookie,
      }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-studio-base-path="/studio"');
    expect(html).toContain(
      'data-studio-principal-name="Public account holder"',
    );
    expect(html).toContain('data-studio-principal-role="public"');
  });

  it("serves the authenticated shell for a deep entity route", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/entities").handler(
      apiRequest("/studio/entities/note/journal%2Fday-one", { cookie }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain('data-studio-base-path="/studio"');
    expect(html).toContain(
      'href="/logout?return_to=%2Fstudio%2Fentities%2Fnote%2Fjournal%252Fday-one"',
    );
  });

  it("registers the editor asset route", async () => {
    const shell = createEditorTestShell();
    const plugin = await registerPlugin(shell);

    // The bundle may not be built when tests run; the route must exist and
    // either serve JS or answer 404, never throw.
    const assetRoute = findRoute(plugin, "/studio/assets");
    expect(assetRoute.match).toBe("prefix");

    const response = await assetRoute.handler(
      apiRequest("/studio/assets/app.js"),
    );
    expect(response.status).toBe(200);

    const accountChunk = [
      ...new Bun.Glob("studio-chunks/account-view-*.js").scanSync({
        cwd: join(import.meta.dir, "..", "dist", "ui"),
      }),
    ][0];
    if (!accountChunk) throw new Error("Missing built Account chunk");
    const chunkResponse = await assetRoute.handler(
      apiRequest(`/studio/assets/${accountChunk}`),
    );
    expect(chunkResponse.status).toBe(200);
    expect(chunkResponse.headers.get("content-type")).toContain(
      "text/javascript",
    );

    const traversal = await assetRoute.handler(
      apiRequest("/studio/assets/%2F..%2Fpackage.json"),
    );
    expect(traversal.status).toBe(404);
  });
});

describe("studio editor api", () => {
  it("rejects every api route without an auth session", async () => {
    const shell = createEditorTestShell();
    await seedPost(shell);
    const plugin = await registerPlugin(shell);

    const attempts: Array<[WebRouteDefinition, Request]> = [
      [findRoute(plugin, "/studio/api/types"), apiRequest("/studio/api/types")],
      [
        findRoute(plugin, "/studio/api/schema"),
        apiRequest("/studio/api/schema?type=post"),
      ],
      [
        findRoute(plugin, "/studio/api/entities"),
        apiRequest("/studio/api/entities?type=post"),
      ],
      [
        findRoute(plugin, "/studio/api/entities", "PUT"),
        apiRequest("/studio/api/entities", {
          method: "PUT",
          body: {
            entityType: "post",
            id: "hello-world",
            frontmatter: { title: "X" },
          },
        }),
      ],
      [
        findRoute(plugin, "/studio/api/entities", "POST"),
        apiRequest("/studio/api/entities", {
          method: "POST",
          body: { entityType: "post", frontmatter: { title: "X" } },
        }),
      ],
      [
        findRoute(plugin, "/studio/api/entities", "DELETE"),
        apiRequest("/studio/api/entities?type=post&id=hello-world", {
          method: "DELETE",
        }),
      ],
      [
        findRoute(plugin, "/studio/api/assist", "POST"),
        apiRequest("/studio/api/assist", {
          method: "POST",
          body: {
            entityType: "post",
            instruction: "tighten",
            selection: "The original body.",
            body: "The original body.",
            frontmatter: { title: "Hello World" },
          },
        }),
      ],
      [
        findRoute(plugin, "/studio/api/agents"),
        apiRequest("/studio/api/agents"),
      ],
      [
        findRoute(plugin, "/studio/api/ask-agent", "POST"),
        apiRequest("/studio/api/ask-agent", {
          method: "POST",
          body: {
            agent: "docs.example",
            instruction: "fact-check",
            selection: "The original body.",
          },
        }),
      ],
    ];

    for (const [route, request] of attempts) {
      const response = await route.handler(request);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "Authentication required",
      });
    }
  });

  it("rewrites a selected markdown range through AI without writing entities", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world", body: "The original body." });
    const prompts: string[] = [];
    shell.generateObject = async <T>(
      prompt: string,
      schema: z.ZodType<T>,
    ): Promise<{ object: T }> => {
      prompts.push(prompt);
      return {
        object: schema.parse({ suggestion: "A tighter body." }),
      };
    };
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/studio/api/assist",
      "POST",
    ).handler(
      apiRequest("/studio/api/assist", {
        cookie,
        method: "POST",
        body: {
          entityType: "post",
          id: "hello-world",
          instruction: "tighten this",
          selection: "The original body.",
          body: "The original body.",
          frontmatter: { title: "Hello World" },
        },
      }),
    );
    const payload = suggestionPayloadSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.suggestion).toBe("A tighter body.");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("tighten this");
    expect(prompts[0]).toContain("Selected markdown");

    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: "hello-world",
    });
    expect(stored?.content).toContain("The original body.");
    expect(stored?.content).not.toContain("A tighter body.");
  });

  it("suggests a body summary and tags without writing entities", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, {
      id: "hello-world",
      body: "A detailed original body.",
    });
    const prompts: string[] = [];
    shell.generateObject = async <T>(
      prompt: string,
      schema: z.ZodType<T>,
    ): Promise<{ object: T }> => {
      prompts.push(prompt);
      return {
        object: schema.parse(
          prompt.includes("Suggest tags")
            ? { suggestions: ["studio", "authoring"] }
            : { suggestion: "A concise summary." },
        ),
      };
    };
    const plugin = await registerPlugin(shell);
    const route = findRoute(plugin, "/studio/api/assist", "POST");

    const summary = await route.handler(
      apiRequest("/studio/api/assist", {
        cookie,
        method: "POST",
        body: {
          variant: "summarise",
          entityType: "post",
          id: "hello-world",
          targetField: "summary",
          body: "A detailed original body.",
          frontmatter: { title: "Hello World" },
        },
      }),
    );
    expect(summary.status).toBe(200);
    expect(await summary.json()).toEqual({
      variant: "summarise",
      targetField: "summary",
      suggestion: "A concise summary.",
    });

    const tags = await route.handler(
      apiRequest("/studio/api/assist", {
        cookie,
        method: "POST",
        body: {
          variant: "tag-suggest",
          entityType: "post",
          id: "hello-world",
          targetField: "tags",
          body: "A detailed original body.",
          frontmatter: { title: "Hello World" },
        },
      }),
    );
    expect(tags.status).toBe(200);
    expect(await tags.json()).toEqual({
      variant: "tag-suggest",
      targetField: "tags",
      suggestions: ["studio", "authoring"],
    });
    expect(prompts).toHaveLength(2);

    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: "hello-world",
    });
    expect(stored?.content).toContain("A detailed original body.");
    expect(stored?.content).not.toContain("A concise summary.");
    expect(stored?.content).not.toContain("authoring");
  });

  it("rejects prompt variants targeting incompatible fields", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world", body: "Body" });
    const plugin = await registerPlugin(shell);
    const route = findRoute(plugin, "/studio/api/assist", "POST");

    for (const body of [
      {
        variant: "summarise",
        entityType: "post",
        id: "hello-world",
        targetField: "tags",
        body: "Body",
        frontmatter: { title: "Hello" },
      },
      {
        variant: "tag-suggest",
        entityType: "post",
        id: "hello-world",
        targetField: "title",
        body: "Body",
        frontmatter: { title: "Hello" },
      },
    ]) {
      const response = await route.handler(
        apiRequest("/studio/api/assist", {
          cookie,
          method: "POST",
          body,
        }),
      );
      expect(response.status).toBe(400);
    }
  });

  it("lists approved agents only when the a2a interface answers", async () => {
    const shell = createEditorTestShell();
    await seedPost(shell, { id: "hello-world", body: "The original body." });
    shell.getMessageBus().subscribe("a2a:call:agents", async () => ({
      success: true,
      data: {
        agents: [
          { id: "docs.example", label: "Docs" },
          { id: "review.example", label: "Reviewer" },
        ],
      },
    }));
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/agents").handler(
      apiRequest("/studio/api/agents?type=post&id=hello-world", { cookie }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      agents: [
        { id: "docs.example", label: "Docs" },
        { id: "review.example", label: "Reviewer" },
      ],
    });
  });

  it("asks one agent about a selection without writing entities", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world", body: "The original body." });
    const calls: unknown[] = [];
    shell.getMessageBus().subscribe("a2a:call:request", async (message) => {
      calls.push(message.payload);
      return {
        success: true,
        data: { state: "completed", response: "The claim is accurate." },
      };
    });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/studio/api/ask-agent",
      "POST",
    ).handler(
      apiRequest("/studio/api/ask-agent", {
        cookie,
        method: "POST",
        body: {
          entityType: "post",
          id: "hello-world",
          agent: "docs.example",
          instruction: "Is this accurate?",
          selection: "The original body.",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      agentId: "docs.example",
      response: "The claim is accurate.",
    });
    expect(calls).toEqual([
      expect.objectContaining({
        agent: "docs.example",
        instruction: "Is this accurate?",
        selection: "The original body.",
        entityType: "post",
        entityId: "hello-world",
        actor: expect.objectContaining({ kind: "user" }),
        interfaceType: "studio",
      }),
    ]);
    const stored = await shell.getEntityService().getEntity({
      entityType: "post",
      id: "hello-world",
    });
    expect(stored?.content).toContain("The original body.");
    expect(stored?.content).not.toContain("The claim is accurate.");
  });

  it("returns a clear 4xx when the a2a handler refuses an agent", async () => {
    const shell = createEditorTestShell();
    await seedPost(shell, { id: "hello-world", body: "Text" });
    shell.getMessageBus().subscribe("a2a:call:request", async () => ({
      success: false,
      error: "Agent unknown.example is not saved or approved.",
    }));
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/studio/api/ask-agent",
      "POST",
    ).handler(
      apiRequest("/studio/api/ask-agent", {
        cookie,
        method: "POST",
        body: {
          entityType: "post",
          id: "hello-world",
          agent: "unknown.example",
          instruction: "Review",
          selection: "Text",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Agent unknown.example is not saved or approved.",
    });
  });

  it("degrades to model-only discovery when a2a is not installed", async () => {
    const shell = createEditorTestShell();
    await seedPost(shell, { id: "hello-world", body: "Text" });
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const agents = await findRoute(plugin, "/studio/api/agents").handler(
      apiRequest("/studio/api/agents?type=post&id=hello-world", { cookie }),
    );
    expect(await agents.json()).toEqual({ agents: [] });

    const ask = await findRoute(
      plugin,
      "/studio/api/ask-agent",
      "POST",
    ).handler(
      apiRequest("/studio/api/ask-agent", {
        cookie,
        method: "POST",
        body: {
          entityType: "post",
          id: "hello-world",
          agent: "docs.example",
          instruction: "Review",
          selection: "Text",
        },
      }),
    );
    expect(ask.status).toBe(503);
    expect(await ask.json()).toEqual({ error: "Agent asking is unavailable" });
  });

  it("rejects empty and oversized assist selections", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);
    const route = findRoute(plugin, "/studio/api/assist", "POST");

    for (const selection of ["", "x".repeat(8_001)]) {
      const response = await route.handler(
        apiRequest("/studio/api/assist", {
          cookie,
          method: "POST",
          body: {
            entityType: "post",
            instruction: "tighten",
            selection,
            body: selection,
            frontmatter: { title: "Hello World" },
          },
        }),
      );
      expect(response.status).toBe(400);
    }
  });

  it("lists entity types with adapter flags", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/types").handler(
      apiRequest("/studio/api/types", { cookie }),
    );
    const payload = typeListPayloadSchema.parse(await response.json());

    expect(response.status).toBe(200);
    const post = payload.types.find((t) => t.entityType === "post");
    expect(post).toEqual({
      entityType: "post",
      label: "Posts",
      isSingleton: false,
      hasBody: true,
      count: 1,
      capabilities: {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canExtract: true,
        canPublish: true,
        canAssist: true,
      },
    });
  });

  it("honours entityDisplay overrides in type labels", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = studioPlugin({
      entityDisplay: { post: { label: "Essay" } },
    });
    await plugin.register(shell);

    const response = await findRoute(plugin, "/studio/api/types").handler(
      apiRequest("/studio/api/types", { cookie }),
    );
    const payload = typeListPayloadSchema.parse(await response.json());

    expect(payload.types.find((t) => t.entityType === "post")?.label).toBe(
      "Essays",
    );
  });

  it("returns field descriptors for a type", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/schema").handler(
      apiRequest("/studio/api/schema?type=post", { cookie }),
    );
    const payload = z
      .object({
        entityType: z.string(),
        isSingleton: z.boolean(),
        hasBody: z.boolean(),
        fields: z.array(z.record(z.string(), z.unknown())),
      })
      .parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.entityType).toBe("post");
    expect(payload.isSingleton).toBe(false);
    expect(payload.hasBody).toBe(true);
    expect(payload.fields).toEqual([
      { name: "title", label: "Title", widget: "string" },
      { name: "summary", label: "Summary", widget: "text", required: false },
      {
        name: "tags",
        label: "Tags",
        widget: "list",
        required: false,
        field: { name: "tags", label: "Tags", widget: "string" },
      },
      {
        name: "published",
        label: "Published",
        widget: "boolean",
        required: false,
      },
      adminVisibilityField,
    ]);
  });

  it("treats base notes as raw markdown with no frontmatter form", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/schema").handler(
      apiRequest("/studio/api/schema?type=note", { cookie }),
    );
    const payload = z
      .object({
        format: z.string(),
        hasBody: z.boolean(),
        fields: z.array(z.unknown()),
      })
      .parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.format).toBe("raw");
    expect(payload.hasBody).toBe(true);
    // The note's domain frontmatter bookkeeping stays hidden, while the
    // system-owned visibility control remains available for every entity.
    expect(payload.fields).toEqual([adminVisibilityField]);
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

    const readBack = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=note&id=rule-note", { cookie }),
    );
    const payload = entityPayloadSchema.parse(await readBack.json());
    expect(payload.entity.frontmatter).toEqual({ visibility: "public" });
    expect(payload.entity.body).toBe(content);

    const newBody = "Rewritten.\n\n---\n\nStill raw.\n";
    const update = await findRoute(
      plugin,
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "note",
          id: "rule-note",
          frontmatter: { visibility: "restricted" },
          body: newBody,
        },
      }),
    );
    expect(update.status).toBe(200);

    const stored = await shell.getEntityService().getEntity({
      entityType: "note",
      id: "rule-note",
      visibilityScope: "restricted",
    });
    expect(stored?.content).toBe(newBody);
    expect(stored?.visibility).toBe("restricted");
  });

  it("projects authoritative visibility into the editor and keeps it after reload", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await shell.getEntityService().createEntity({
      entity: {
        id: "restricted-brief",
        entityType: "brief",
        // Stored content can lag the top-level policy field. The editor must
        // render the entity's authoritative visibility, not this envelope.
        content: "---\ntitle: Restricted\n---\n\nBody.\n",
        metadata: { title: "Restricted" },
        visibility: "restricted",
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-01T00:00:00.000Z",
      },
    });
    const plugin = await registerPlugin(shell);

    const read = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=brief&id=restricted-brief", {
        cookie,
      }),
    );
    const loaded = entityPayloadSchema.parse(await read.json());
    expect(loaded.entity.frontmatter).toEqual({
      title: "Restricted",
      visibility: "restricted",
    });

    const update = await findRoute(
      plugin,
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "brief",
          id: "restricted-brief",
          frontmatter: { title: "Restricted", visibility: "public" },
          body: "Edited.\n",
        },
      }),
    );

    expect(update.status).toBe(200);
    const stored = await shell.getEntityService().getEntity({
      entityType: "brief",
      id: "restricted-brief",
      visibilityScope: "restricted",
    });
    expect(stored?.visibility).toBe("public");
    expect(stored?.content).toContain("Edited.");
    expect(stored?.content).not.toContain("visibility:");

    const readAfterSave = await findRoute(
      plugin,
      "/studio/api/entities",
    ).handler(
      apiRequest("/studio/api/entities?type=brief&id=restricted-brief", {
        cookie,
      }),
    );
    const reloaded = entityPayloadSchema.parse(await readAfterSave.json());
    expect(reloaded.entity.frontmatter["visibility"]).toBe("public");
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
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
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

    const response = await findRoute(plugin, "/studio/api/schema").handler(
      apiRequest("/studio/api/schema?type=mystery", { cookie }),
    );

    expect(response.status).toBe(404);
  });

  it("lists entities of a type with their frontmatter", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "first-post", title: "First Post" });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=post", { cookie }),
    );
    const payload = entityListPayloadSchema.parse(await response.json());

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

    const response = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=post&id=hello-world", { cookie }),
    );
    const payload = z
      .object({ entity: z.object({ contentHash: z.string() }) })
      .parse(await response.json());

    expect(payload.entity.contentHash.length).toBeGreaterThan(0);
  });

  it("rejects a stale write when the entity changed under the editor", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world", title: "Hello World" });
    const plugin = await registerPlugin(shell);

    const response = await findRoute(
      plugin,
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
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
    const payload = z
      .object({ error: z.string() })
      .parse(await response.json());
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

    const read = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=post&id=hello-world", { cookie }),
    );
    const { entity } = entityPayloadSchema.parse(await read.json());

    const response = await findRoute(
      plugin,
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
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

  it("tells the client when a save changed nothing", async () => {
    // The entity service skips no-op writes (no event, no export, no
    // commit), so the save-pipeline strip must know not to wait for one.
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    await seedPost(shell, { id: "hello-world" });
    const plugin = await registerPlugin(shell);
    const put = findRoute(plugin, "/studio/api/entities", "PUT");
    const writeBody = {
      entityType: "post",
      id: "hello-world",
      frontmatter: { title: "Edited Once" },
      body: "The edited body.",
    };

    const first = await put.handler(
      apiRequest("/studio/api/entities", {
        cookie,
        method: "PUT",
        body: writeBody,
      }),
    );
    expect(first.status).toBe(200);
    expect(skippedPayloadSchema.parse(await first.json()).skipped).toBe(false);

    const second = await put.handler(
      apiRequest("/studio/api/entities", {
        cookie,
        method: "PUT",
        body: writeBody,
      }),
    );
    expect(second.status).toBe(200);
    expect(skippedPayloadSchema.parse(await second.json()).skipped).toBe(true);
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

    const response = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=post&id=hello-world", { cookie }),
    );
    const payload = entityPayloadSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.entity.id).toBe("hello-world");
    expect(payload.entity.frontmatter).toEqual({
      title: "Hello World",
      visibility: "public",
    });
    expect(payload.entity.body.trim()).toBe("The original body.");
  });

  it("returns 404 for a missing entity", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=post&id=nope", { cookie }),
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
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
        cookie,
        method: "PUT",
        body: {
          entityType: "post",
          id: "hello-world",
          frontmatter: { title: "Hello Again", summary: "Now with summary" },
        },
      }),
    );
    const payload = entityIdPayloadSchema.parse(await response.json());

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
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
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

    const readBack = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=post&id=hello-world", { cookie }),
    );
    const payload = entityPayloadSchema.parse(await readBack.json());
    expect(payload.entity.frontmatter).toEqual({
      title: "Hello Body",
      visibility: "public",
    });
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
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
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
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
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
      "/studio/api/entities",
      "POST",
    ).handler(
      apiRequest("/studio/api/entities", {
        cookie,
        method: "POST",
        body: {
          entityType: "post",
          frontmatter: { title: "Fresh Post" },
          body: "First draft.",
        },
      }),
    );
    const payload = entityIdPayloadSchema.parse(await response.json());

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
      "/studio/api/entities",
      "POST",
    ).handler(
      apiRequest("/studio/api/entities", {
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
      "/studio/api/entities",
      "POST",
    ).handler(
      apiRequest("/studio/api/entities", {
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
      "/studio/api/entities",
      "DELETE",
    ).handler(
      apiRequest("/studio/api/entities?type=post&id=doomed", {
        cookie,
        method: "DELETE",
        body: { confirmed: true },
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
      "/studio/api/entities",
      "DELETE",
    ).handler(
      apiRequest("/studio/api/entities?type=post&id=ghost", {
        cookie,
        method: "DELETE",
        body: { confirmed: true },
      }),
    );

    expect(response.status).toBe(404);
  });

  it("reports singleton types with their adapter flags", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/types").handler(
      apiRequest("/studio/api/types", { cookie }),
    );
    const payload = typeListPayloadSchema.parse(await response.json());

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

    const response = await findRoute(plugin, "/studio/api/entities").handler(
      apiRequest("/studio/api/entities?type=site-info", { cookie }),
    );
    const payload = entityListPayloadSchema.parse(await response.json());

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
      "/studio/api/entities",
      "PUT",
    ).handler(
      apiRequest("/studio/api/entities", {
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

describe("studio editor sync status", () => {
  /** The payload directory-sync answers sync:status:request with. */
  const syncStatusData = {
    syncPath: "/tmp/sync",
    isInitialized: true,
    watchEnabled: true,
    lastSync: "2026-07-09T10:00:00.000Z",
    git: {
      branch: "main",
      hasChanges: false,
      ahead: 0,
      behind: 0,
      lastCommit: "abc1234def5678",
      remote: "origin/main",
    },
  };

  it("requires an auth session", async () => {
    const shell = createEditorTestShell();
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/sync-status").handler(
      apiRequest("/studio/api/sync-status"),
    );

    expect(response.status).toBe(401);
  });

  it("maps the directory-sync status onto the save-pipeline payload", async () => {
    const shell = createEditorTestShell();
    shell.getMessageBus().subscribe("sync:status:request", async () => ({
      success: true,
      data: syncStatusData,
    }));
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/sync-status").handler(
      apiRequest("/studio/api/sync-status", { cookie }),
    );
    const payload = syncStatusPayloadSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.directorySync).toEqual({
      lastSync: "2026-07-09T10:00:00.000Z",
      watching: true,
    });
    expect(payload.git).toEqual({
      branch: "main",
      hasChanges: false,
      ahead: 0,
      behind: 0,
      lastCommit: "abc1234def5678",
      remote: "origin/main",
    });
  });

  it("degrades to nulls when directory-sync is not installed", async () => {
    const shell = createEditorTestShell();
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/sync-status").handler(
      apiRequest("/studio/api/sync-status", { cookie }),
    );
    const payload = syncStatusPayloadSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.directorySync).toBeNull();
    expect(payload.git).toBeNull();
  });

  it("degrades to nulls when the status payload is malformed", async () => {
    const shell = createEditorTestShell();
    shell.getMessageBus().subscribe("sync:status:request", async () => ({
      success: true,
      data: { unexpected: true },
    }));
    const cookie = await createSessionCookie(shell);
    const plugin = await registerPlugin(shell);

    const response = await findRoute(plugin, "/studio/api/sync-status").handler(
      apiRequest("/studio/api/sync-status", { cookie }),
    );
    const payload = syncStatusPayloadSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.directorySync).toBeNull();
    expect(payload.git).toBeNull();
  });
});
