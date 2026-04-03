import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createSilentLogger } from "@brains/test-utils";
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
});
