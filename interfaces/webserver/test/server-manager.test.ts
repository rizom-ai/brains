import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createSilentLogger } from "@brains/test-utils";
import { ServerManager } from "../src/server-manager";

describe("ServerManager (in-process)", () => {
  let testDir: string;
  let manager: ServerManager;

  afterEach(async () => {
    if (manager !== undefined) {
      await manager.stop();
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function setup(options?: { preview?: boolean }): void {
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
  }

  it("should start and serve production site", async () => {
    setup();
    await manager.start();

    const status = manager.getStatus();
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
    setup();
    await manager.start();
    expect(manager.getStatus().running).toBe(true);

    await manager.stop();
    expect(manager.getStatus().running).toBe(false);
  });

  it("should report not running before start", () => {
    setup();
    const status = manager.getStatus();
    expect(status.running).toBe(false);
    expect(status.productionUrl).toBeUndefined();
  });

  it("should serve 404 for missing pages", async () => {
    setup();
    await manager.start();

    const status = manager.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("should serve preview site when configured", async () => {
    setup({ preview: true });
    await manager.start();

    const status = manager.getStatus();
    expect(status.previewUrl).toBeDefined();

    const url = status.previewUrl;
    expect(url).toBeDefined();
    if (!url) return;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Preview");
  });

  it("should handle /health endpoint", async () => {
    setup();
    await manager.start();

    const status = manager.getStatus();
    const url = status.productionUrl;
    if (!url) return;
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });
});
