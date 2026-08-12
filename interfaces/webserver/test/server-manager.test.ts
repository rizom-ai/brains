import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createSilentLogger } from "@brains/test-utils";
import type {
  ApiRouteDefinition,
  RuntimeReadiness,
  WebRouteHandler,
  WebRouteMatch,
  WebRouteMethod,
} from "@brains/plugins";
import type {
  RegisteredHttpRoute,
  SharedHostAdmission,
} from "@brains/plugins/internal/http-routes";
import { createMockMessageBus, type IMessageBus } from "@brains/plugins/test";
import {
  ServerManager,
  type ServerManagerOptions,
  WEBSERVER_IDLE_TIMEOUT_SECONDS,
  isPathContained,
} from "../src/server-manager";

describe("ServerManager (in-process)", () => {
  let testDir: string;
  let manager: ServerManager | null = null;

  function handlerRoute(
    ownerPluginId: string,
    fullPath: string,
    handler: WebRouteHandler,
    options: {
      method?: WebRouteMethod;
      match?: WebRouteMatch;
      admission?: SharedHostAdmission;
    } = {},
  ): RegisteredHttpRoute {
    return {
      kind: "handler",
      ownerPluginId,
      fullPath,
      method: options.method ?? "GET",
      match: options.match ?? "exact",
      sharedHostAdmission: options.admission ?? "admit",
      handler,
    };
  }

  function toolRoute(
    ownerPluginId: string,
    fullPath: string,
    definition: ApiRouteDefinition,
    admission: SharedHostAdmission = "admit",
  ): RegisteredHttpRoute {
    return {
      kind: "tool",
      ownerPluginId,
      fullPath,
      method: definition.method,
      match: "exact",
      sharedHostAdmission: admission,
      definition,
    };
  }

  afterEach(async () => {
    if (manager) {
      await manager.stop();
      manager = null;
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function testResourceSignals(): RuntimeReadiness["resources"] {
    return {
      memory: { rssBytes: 1, heapUsedBytes: 1, heapTotalBytes: 1 },
      fileDescriptors: 1,
      processes: { total: 1, zombies: 0 },
      queue: {
        totals: { pending: 0, processing: 0, completed: 0, failed: 0 },
        byType: [],
        oldestPendingAgeMs: null,
        duePending: 0,
        oldestDuePendingAgeMs: null,
        latestClaimAgeMs: null,
        oldestProcessingAgeMs: null,
        staleLeaseCount: 0,
        workerSessions: {
          total: 1,
          active: 1,
          stale: 0,
          latestHeartbeatAgeMs: 1,
        },
      },
      projection: {
        initialized: true,
        trackedRoots: 0,
        openCircuits: [],
      },
      worker: {
        total: 1,
        active: 1,
        stale: 0,
        latestHeartbeatAgeMs: 1,
      },
    };
  }

  function setup(options?: {
    preview?: boolean;
    getOperationalInfo?: ServerManagerOptions["getOperationalInfo"];
    getReadinessData?: () => Promise<RuntimeReadiness>;
  }): ServerManager {
    testDir = mkdtempSync(join(tmpdir(), "webserver-test-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(prodDir, "index.html"), "<h1>Hello</h1>");

    const opts: ConstructorParameters<typeof ServerManager>[0] = {
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0, // random port
      ...(options?.getOperationalInfo && {
        getOperationalInfo: options.getOperationalInfo,
      }),
      ...(options?.getReadinessData && {
        getReadinessData: options.getReadinessData,
      }),
    };

    if (options?.preview) {
      const previewDir = join(testDir, "dist", "preview");
      mkdirSync(previewDir, { recursive: true });
      writeFileSync(join(previewDir, "index.html"), "<h1>Preview</h1>");
      opts.previewDistDir = previewDir;
    }

    manager = new ServerManager(opts);
    return manager;
  }

  it("should start and serve production site", async () => {
    const m = setup();
    await m.start();

    const status = m.getStatus();
    expect(status.running).toBe(true);
    expect(status.productionUrl).toBeDefined();

    const url = status.productionUrl;
    expect(url).toBeDefined();
    if (!url) return;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Hello");
  });

  it("hides build metadata while serving legitimate well-known assets", async () => {
    // The site build publishes `.site-build-manifest.json` into the generation
    // it commits, and the active output pointer resolves into that directory.
    // The manifest is build metadata — route inventory, artifact hashes,
    // diagnostics — and must not be reachable over HTTP.
    const m = setup();
    const productionDir = join(testDir, "dist", "production");
    writeFileSync(
      join(productionDir, ".site-build-manifest.json"),
      '{"buildId":"secret"}',
    );
    mkdirSync(join(productionDir, ".well-known"), { recursive: true });
    writeFileSync(
      join(productionDir, ".well-known", "site-canary.json"),
      '{"status":"ok"}',
    );
    await m.start();

    const url = m.getStatus().productionUrl;
    expect(url).toBeDefined();
    if (!url) return;

    const manifest = await fetch(`${url}/.site-build-manifest.json`);
    expect(manifest.status).toBe(404);
    expect(await manifest.text()).not.toContain("secret");

    // Dot-prefixed public paths are valid and used by discovery and site
    // verification assets; only the internal build manifest is reserved.
    const canary = await fetch(`${url}/.well-known/site-canary.json`);
    expect(canary.status).toBe(200);
    expect(await canary.json()).toEqual({ status: "ok" });

    const index = await fetch(`${url}/`);
    expect(index.status).toBe(200);
  });

  it("serves rebuilt-in-place assets (css/js) without immutable caching", async () => {
    // main.css and boot.js live at stable URLs and change on every site
    // rebuild. An immutable/max-age=1y header lets the CDN edge and browsers
    // hold a stale copy for up to a year — new pages then render against
    // old CSS (the /essays detail page shipped unstyled this way).
    const m = setup();
    const prodDir = join(testDir, "dist", "production");
    mkdirSync(join(prodDir, "styles"), { recursive: true });
    writeFileSync(join(prodDir, "styles", "main.css"), "body{}");
    writeFileSync(join(prodDir, "boot.js"), ";");
    writeFileSync(join(prodDir, "logo.png"), "png");
    await m.start();

    const url = m.getStatus().productionUrl;
    expect(url).toBeDefined();
    if (!url) return;

    for (const path of ["/styles/main.css", "/boot.js"]) {
      const res = await fetch(`${url}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-cache");
    }

    // Images stay immutable: the shared images dir is content-addressed.
    const img = await fetch(`${url}/logo.png`);
    expect(img.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("should stop cleanly", async () => {
    const m = setup();
    await m.start();
    expect(m.getStatus().running).toBe(true);

    await m.stop();
    expect(m.getStatus().running).toBe(false);
  });

  it("should report not running before start", () => {
    const m = setup();
    const status = m.getStatus();
    expect(status.running).toBe(false);
    expect(status.productionUrl).toBeUndefined();
  });

  it("should serve 404 for missing pages", async () => {
    const m = setup();
    await m.start();

    const status = m.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("should expose preview on the shared host when configured", async () => {
    const m = setup({ preview: true });
    await m.start();

    const status = m.getStatus();
    expect(status.previewUrl).toBe(status.productionUrl);

    const url = status.productionUrl;
    expect(url).toBeDefined();
    if (!url) return;
    const res = await fetch(url, {
      headers: { Host: "preview.localhost" },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Preview");
  });

  it("serves health endpoints on the production control plane for preview hosts", async () => {
    const m = setup({ preview: true });
    await m.start();

    const url = m.getStatus().productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/health/live`, {
      headers: { Host: "preview.localhost" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "alive" });
  });

  it("should serve preview content on the shared host when the request host matches preview", async () => {
    const m = setup({ preview: true });
    await m.start();

    const status = m.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(url, {
      headers: { Host: "preview.localhost" },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Preview");
  });

  it("serves dependency-free liveness without invoking readiness", async () => {
    let readinessCalls = 0;
    const m = setup({
      getReadinessData: async () => {
        readinessCalls++;
        throw new Error("readiness must not run for liveness");
      },
    });
    await m.start();

    const url = m.getStatus().productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/health/live`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "alive" });
    expect(readinessCalls).toBe(0);
  });

  it("returns 503 readiness details when routing dependencies are unhealthy", async () => {
    const report: RuntimeReadiness = {
      status: "not_ready",
      operationalStatus: "degraded",
      checkedAt: "2026-07-30T12:00:00.000Z",
      checks: [
        {
          name: "entity-database",
          status: "unhealthy",
          message: "entity database offline",
        },
      ],
      resources: testResourceSignals(),
    };
    const m = setup({ getReadinessData: async () => report });
    await m.start();

    const url = m.getStatus().productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/health/ready`);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(report);
  });

  it("keeps routing ready while operational health reports worker degradation", async () => {
    const report: RuntimeReadiness = {
      status: "ready",
      operationalStatus: "degraded",
      checkedAt: "2026-07-30T12:00:00.000Z",
      checks: [
        {
          name: "job-worker",
          status: "degraded",
          message: "No live worker session",
        },
      ],
      resources: testResourceSignals(),
    };
    const m = setup({ getReadinessData: async () => report });
    await m.start();

    const url = m.getStatus().productionUrl;
    if (!url) return;
    const ready = await fetch(`${url}/health/ready`);
    const operate = await fetch(`${url}/health/operate`);

    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual(report);
    expect(operate.status).toBe(503);
    expect(await operate.json()).toEqual(report);
  });

  it("returns 200 operational health when every check is healthy", async () => {
    const report: RuntimeReadiness = {
      status: "ready",
      operationalStatus: "operational",
      checkedAt: "2026-07-30T12:00:00.000Z",
      checks: [{ name: "job-worker", status: "healthy" }],
      resources: testResourceSignals(),
    };
    const m = setup({ getReadinessData: async () => report });
    await m.start();

    const url = m.getStatus().productionUrl;
    if (!url) return;
    const operate = await fetch(`${url}/health/operate`);

    expect(operate.status).toBe(200);
    expect(await operate.json()).toEqual(report);
  });

  it("reports operational metadata failures without changing routing readiness", async () => {
    const m = setup({
      getReadinessData: async () => ({
        status: "ready",
        operationalStatus: "operational",
        checkedAt: "2026-07-30T12:00:00.000Z",
        checks: [],
        resources: testResourceSignals(),
      }),
      getOperationalInfo: async () => {
        throw new Error("entity summary failed");
      },
    });
    await m.start();

    const url = m.getStatus().productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/health/operate`);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      status: "ready",
      operationalStatus: "degraded",
      checks: [
        {
          name: "app-info",
          status: "unhealthy",
          message: "entity summary failed",
        },
      ],
    });
  });

  it("includes app metadata in operational health", async () => {
    const m = setup({
      getReadinessData: async () => ({
        status: "ready",
        operationalStatus: "operational",
        checkedAt: "2026-07-30T12:00:00.000Z",
        checks: [],
        resources: testResourceSignals(),
      }),
      getOperationalInfo: async () => ({
        model: "test",
        version: "0.2.0-test",
        uptime: 10,
        entities: 4,
        entityCounts: [{ entityType: "note", count: 4 }],
        embeddings: 4,
        ai: { model: "test", embeddingModel: "test" },
        daemons: [],
        endpoints: [],
        interactions: [],
      }),
    });
    await m.start();

    const url = m.getStatus().productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/health/operate`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "ready",
      operationalStatus: "operational",
      app: {
        version: "0.2.0-test",
        entities: 4,
        entityCounts: [{ entityType: "note", count: 4 }],
      },
    });
  });

  it("does not serve an aggregate health endpoint", async () => {
    const m = setup({ preview: true });
    for (const surface of ["production", "preview"]) {
      const staticHealthDir = join(testDir, "dist", surface, "health");
      mkdirSync(staticHealthDir, { recursive: true });
      writeFileSync(join(staticHealthDir, "index.html"), "stale health page");
    }
    await m.start();

    const url = m.getStatus().productionUrl;
    if (!url) return;
    expect((await fetch(`${url}/health`)).status).toBe(404);
    expect(
      (
        await fetch(`${url}/health`, {
          headers: { host: "preview.example.com" },
        })
      ).status,
    ).toBe(404);
  });

  it("should serve plugin-contributed web routes when configured", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-cms-test-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(prodDir, "index.html"), "<h1>Hello</h1>");

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        handlerRoute(
          "admin",
          "/cms-config",
          async (): Promise<Response> =>
            new Response("backend:\n  repo: owner/repo\n", {
              headers: { "Content-Type": "text/yaml; charset=utf-8" },
            }),
        ),
      ],
    });

    await manager.start();

    const status = manager.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/cms-config`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/yaml");
    expect(await res.text()).toContain("owner/repo");
  });

  it("serves dynamic routes before generated static pages", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-dynamic-shadow-"));
    const prodDir = join(testDir, "dist", "production");
    const staticRouteDir = join(prodDir, "dynamic");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(staticRouteDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(staticRouteDir, "index.html"), "static page");

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        handlerRoute(
          "dashboard",
          "/dynamic",
          (): Response => new Response("dynamic handler"),
        ),
      ],
    });

    await manager.start();
    const url = manager.getStatus().productionUrl;
    if (!url) return;

    const response = await fetch(`${url}/dynamic`);
    expect(await response.text()).toBe("dynamic handler");
  });

  it("matches contributed prefix routes by segment with exact and longest-prefix precedence", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-prefix-routes-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });

    const route = (
      path: string,
      body: string,
      match: "exact" | "prefix" = "exact",
    ): RegisteredHttpRoute =>
      handlerRoute(
        "cms",
        path,
        async (): Promise<Response> => new Response(body),
        { match },
      );

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        route("/cms/entities", "entities-shell", "prefix"),
        route("/cms/entities/post", "post-shell", "prefix"),
        route("/cms/entities/post/featured", "featured-exact"),
      ],
    });
    await manager.start();

    const url = manager.getStatus().productionUrl;
    expect(url).toBeDefined();
    if (!url) return;

    expect(await (await fetch(`${url}/cms/entities/note/one`)).text()).toBe(
      "entities-shell",
    );
    expect(await (await fetch(`${url}/cms/entities/post/one`)).text()).toBe(
      "post-shell",
    );
    expect(
      await (await fetch(`${url}/cms/entities/post/featured`)).text(),
    ).toBe("featured-exact");
    expect((await fetch(`${url}/cms/entities-other`)).status).toBe(404);
    expect(
      (await fetch(`${url}/cms/entities/post/one`, { method: "POST" })).status,
    ).toBe(404);
  });

  it("should reject non-public web routes with 401", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-nonpublic-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(prodDir, "index.html"), "<h1>Hello</h1>");

    let handlerCalled = false;
    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        handlerRoute(
          "admin",
          "/private",
          async (): Promise<Response> => {
            handlerCalled = true;
            return new Response("secret");
          },
          { admission: "deny" },
        ),
      ],
    });

    await manager.start();

    const status = manager.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/private`);
    expect(res.status).toBe(401);
    expect(handlerCalled).toBe(false);
  });

  it("should not serve images from a sibling directory sharing the prefix", () => {
    const imagesDir = join(tmpdir(), "webserver-test-images");

    expect(isPathContained(join(imagesDir, "photo.png"), imagesDir)).toBe(true);
    expect(isPathContained(imagesDir, imagesDir)).toBe(true);
    // Sibling dir shares the string prefix but is not contained
    expect(isPathContained(`${imagesDir}-secret/leak.png`, imagesDir)).toBe(
      false,
    );
  });

  it("resolves the normalized route snapshot once at startup", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-route-discovery-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });

    let routeReads = 0;
    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => {
        routeReads += 1;
        return [];
      },
    });

    await manager.start();
    const url = manager.getStatus().productionUrl;
    if (!url) return;

    await fetch(`${url}/first`);
    await fetch(`${url}/second`);

    expect(routeReads).toBe(1);
  });

  it("keeps dynamic routes off the preview host", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-preview-routes-"));
    const prodDir = join(testDir, "dist", "production");
    const previewDir = join(testDir, "dist", "preview");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(previewDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      previewDistDir: previewDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        handlerRoute(
          "fixture",
          "/dynamic",
          (): Response => new Response("production route"),
        ),
      ],
    });

    await manager.start();
    const url = manager.getStatus().productionUrl;
    if (!url) return;

    expect((await fetch(`${url}/dynamic`)).status).toBe(200);
    expect(
      (
        await fetch(`${url}/dynamic`, {
          headers: { host: "preview.example.com" },
        })
      ).status,
    ).toBe(404);
  });

  it("does not observe handler routes added after startup", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-late-web-routes-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(prodDir, "index.html"), "<h1>Hello</h1>");

    let currentRoutes: RegisteredHttpRoute[] = [];

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => currentRoutes,
    });

    await manager.start();

    currentRoutes = [
      handlerRoute(
        "a2a",
        "/.well-known/agent-card.json",
        async (): Promise<Response> =>
          Response.json({ name: "Late Agent Card" }),
      ),
    ];

    const status = manager.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/.well-known/agent-card.json`);
    expect(res.status).toBe(404);
  });

  it("should serve plugin-contributed OPTIONS routes when configured", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-options-test-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(prodDir, "index.html"), "<h1>Hello</h1>");

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        handlerRoute(
          "mcp",
          "/mcp",
          async (): Promise<Response> =>
            new Response(null, {
              status: 204,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
              },
            }),
          { method: "OPTIONS" },
        ),
      ],
    });

    await manager.start();

    const status = manager.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/mcp`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain(
      "OPTIONS",
    );
  });

  it("should serve plugin-contributed API routes on the shared host", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-api-test-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(prodDir, "index.html"), "<h1>Hello</h1>");

    const messageBus = createMockMessageBus({
      returns: {
        send: {
          success: true,
          data: { success: true, data: { subscribed: true } },
        },
      },
    }) as unknown as IMessageBus;

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        toolRoute("newsletter", "/api/newsletter/subscribe", {
          path: "/subscribe",
          method: "POST",
          tool: "subscribe",
          public: true,
        }),
      ],
      messageBus,
    });

    await manager.start();

    const status = manager.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/api/newsletter/subscribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { subscribed: true },
    });
  });

  it("fails loudly when a tool route has no message bus", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-api-no-bus-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        toolRoute("example", "/api/example/run", {
          path: "/run",
          method: "POST",
          tool: "run",
          public: true,
        }),
      ],
    });

    await manager.start();
    const url = manager.getStatus().productionUrl;
    if (!url) return;

    const response = await fetch(`${url}/api/example/run`, { method: "POST" });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("HTTP tool route unavailable");
  });

  it("preserves handler prefixes ahead of exact tool routes", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-route-precedence-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });

    const messageBus = createMockMessageBus({
      returns: {
        send: {
          success: true,
          data: { success: true, data: { source: "tool" } },
        },
      },
    });
    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        handlerRoute(
          "handler-owner",
          "/api/example",
          (): Response => new Response("handler prefix"),
          { method: "POST", match: "prefix" },
        ),
        toolRoute("example", "/api/example/run", {
          path: "/run",
          method: "POST",
          tool: "run",
          public: true,
        }),
      ],
      messageBus,
    });

    await manager.start();
    const url = manager.getStatus().productionUrl;
    if (!url) return;

    const response = await fetch(`${url}/api/example/run`, { method: "POST" });
    expect(await response.text()).toBe("handler prefix");
    expect(messageBus.send).not.toHaveBeenCalled();
  });

  it("rejects non-public API routes before tool execution", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-private-api-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });

    const messageBus = createMockMessageBus({
      returns: {
        send: {
          success: true,
          data: { success: true, data: { invoked: true } },
        },
      },
    });
    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        toolRoute(
          "private-api",
          "/api/private-api/run",
          {
            path: "/run",
            method: "POST",
            tool: "run",
            public: false,
          },
          "deny",
        ),
      ],
      messageBus,
    });

    await manager.start();
    const url = manager.getStatus().productionUrl;
    if (!url) return;

    const response = await fetch(`${url}/api/private-api/run`, {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(messageBus.send).not.toHaveBeenCalled();
  });

  it("does not observe tool routes added after startup", async () => {
    testDir = mkdtempSync(join(tmpdir(), "webserver-late-api-routes-"));
    const prodDir = join(testDir, "dist", "production");
    const imagesDir = join(testDir, "dist", "images");
    mkdirSync(prodDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(prodDir, "index.html"), "<h1>Hello</h1>");

    let currentRoutes: RegisteredHttpRoute[] = [];

    const messageBus = createMockMessageBus({
      returns: {
        send: {
          success: true,
          data: { success: true, data: { registeredLate: true } },
        },
      },
    }) as unknown as IMessageBus;

    manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: prodDir,
      sharedImagesDir: imagesDir,
      productionPort: 0,
      getRoutes: (): readonly RegisteredHttpRoute[] => currentRoutes,
      messageBus,
    });

    await manager.start();

    currentRoutes = [
      toolRoute("newsletter", "/api/newsletter/subscribe", {
        path: "/subscribe",
        method: "POST",
        tool: "subscribe",
        public: true,
      }),
    ];

    const status = manager.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/api/newsletter/subscribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: "late@example.com" }),
    });

    expect(res.status).toBe(404);
    expect(messageBus.send).not.toHaveBeenCalled();
  });

  it("should not start preview server when preview is not configured", async () => {
    const m = setup();
    await m.start();

    const status = m.getStatus();
    expect(status.previewUrl).toBeUndefined();
  });

  // Regression: web-chat's first-upload "[ signal lost ]" timeout.
  //
  // POST /api/chat opens a streaming response and stays silent while the agent
  // runs synchronously; a slow first-turn upload outran Bun's 10s default idle
  // timeout, so Bun closed the socket and the client saw a network error.
  // Stream writes don't reset Bun's idle timer (verified empirically), so the
  // fix is configuring the idle timeout itself. These tests pin that wiring by
  // capturing the exact options ServerManager passes to Bun.serve.
  describe("Bun.serve idle timeout", () => {
    function captureServeOptions(): {
      options: () => { idleTimeout?: number } | undefined;
      serve: typeof Bun.serve;
    } {
      let captured: { idleTimeout?: number } | undefined;
      const serve = ((opts: { idleTimeout?: number }) => {
        captured = opts;
        return {
          port: 12345,
          stop: () => {},
        } as unknown as ReturnType<typeof Bun.serve>;
      }) as unknown as typeof Bun.serve;
      return { options: () => captured, serve };
    }

    function setupWithServe(
      serve: typeof Bun.serve,
      idleTimeout?: number,
    ): ServerManager {
      testDir = mkdtempSync(join(tmpdir(), "webserver-idle-"));
      const prodDir = join(testDir, "dist", "production");
      const imagesDir = join(testDir, "dist", "images");
      mkdirSync(prodDir, { recursive: true });
      mkdirSync(imagesDir, { recursive: true });
      writeFileSync(join(prodDir, "index.html"), "<h1>Hello</h1>");

      const m = new ServerManager({
        logger: createSilentLogger("test"),
        productionDistDir: prodDir,
        sharedImagesDir: imagesDir,
        productionPort: 0,
        serve,
        ...(idleTimeout !== undefined ? { idleTimeout } : {}),
      });
      manager = m;
      return m;
    }

    it("passes the default idle timeout to Bun.serve", async () => {
      const { options, serve } = captureServeOptions();
      await setupWithServe(serve).start();

      // Without this, Bun falls back to its 10s default and closes a slow
      // first-turn /api/chat stream mid-flight.
      expect(options()?.idleTimeout).toBe(WEBSERVER_IDLE_TIMEOUT_SECONDS);
    });

    it("lets callers override the idle timeout", async () => {
      const { options, serve } = captureServeOptions();
      await setupWithServe(serve, 42).start();

      expect(options()?.idleTimeout).toBe(42);
    });

    it("defaults to an idle timeout that covers long agent turns", () => {
      // Bun's default is 10s, which is too short for a cold first-turn upload.
      expect(WEBSERVER_IDLE_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(120);
    });
  });
});
