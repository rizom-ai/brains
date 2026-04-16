import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createSilentLogger, createMockMessageBus } from "@brains/test-utils";
import type { IMessageBus } from "@brains/plugins";
import { ServerManager } from "../src/server-manager";

describe("ServerManager (in-process)", () => {
  let testDir: string;
  let manager: ServerManager | null = null;

  afterEach(async () => {
    if (manager) {
      await manager.stop();
      manager = null;
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function setup(options?: { preview?: boolean }): ServerManager {
    testDir = join(tmpdir(), `webserver-test-${Date.now()}`);
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
    };

    if (options?.preview) {
      const previewDir = join(testDir, "dist", "preview");
      mkdirSync(previewDir, { recursive: true });
      writeFileSync(join(previewDir, "index.html"), "<h1>Preview</h1>");
      opts.previewDistDir = previewDir;
      opts.previewPort = 0;
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

  it("should serve preview site when configured", async () => {
    const m = setup({ preview: true });
    await m.start();

    const status = m.getStatus();
    expect(status.previewUrl).toBeDefined();

    const url = status.previewUrl;
    expect(url).toBeDefined();
    if (!url) return;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Preview");
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

  it("should handle /health endpoint", async () => {
    const m = setup();
    await m.start();

    const status = m.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  it("should serve plugin-contributed web routes when configured", async () => {
    testDir = join(tmpdir(), `webserver-cms-test-${Date.now()}`);
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
      webRoutes: [
        {
          pluginId: "admin",
          fullPath: "/cms-config",
          definition: {
            path: "/cms-config",
            method: "GET",
            public: true,
            handler: async (): Promise<Response> =>
              new Response("backend:\n  repo: owner/repo\n", {
                headers: { "Content-Type": "text/yaml; charset=utf-8" },
              }),
          },
        },
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

  it("should serve plugin-contributed OPTIONS routes when configured", async () => {
    testDir = join(tmpdir(), `webserver-options-test-${Date.now()}`);
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
      webRoutes: [
        {
          pluginId: "mcp",
          fullPath: "/mcp",
          definition: {
            path: "/mcp",
            method: "OPTIONS",
            public: true,
            handler: async (): Promise<Response> =>
              new Response(null, {
                status: 204,
                headers: {
                  "Access-Control-Allow-Origin": "*",
                  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                },
              }),
          },
        },
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
    testDir = join(tmpdir(), `webserver-api-test-${Date.now()}`);
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
      apiRoutes: [
        {
          pluginId: "newsletter",
          fullPath: "/api/newsletter/subscribe",
          definition: {
            path: "/subscribe",
            method: "POST",
            tool: "subscribe",
            public: true,
          },
        },
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

  it("should not start preview server when preview is not configured", async () => {
    const m = setup();
    await m.start();

    const status = m.getStatus();
    expect(status.previewUrl).toBeUndefined();
  });
});
