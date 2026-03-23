import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { markdownToHtml } from "@brains/utils";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import sharp from "sharp";
import { ImageBuildService } from "../../src/lib/image-build-service";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";

/** Create a real PNG as a base64 data URL */
async function createTestDataUrl(
  width: number,
  height: number,
): Promise<string> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 64, b: 32 },
    },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

describe("ImageBuildService", () => {
  const logger = createSilentLogger();
  let outputDir: string;

  beforeEach(async () => {
    outputDir = join(tmpdir(), `image-build-service-test-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("should resolve image entity to optimized WebP", async () => {
    const dataUrl = await createTestDataUrl(2000, 1000);

    const mockEntityService = createMockEntityService({
      returns: {
        getEntity: {
          id: "cover-photo",
          entityType: "image",
          content: dataUrl,
          metadata: { format: "png", width: 2000, height: 1000 },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          contentHash: "abc123",
        },
      },
    });

    const service = new ImageBuildService(outputDir, mockEntityService, logger);
    await service.resolveAll(["cover-photo"]);

    const resolved = service.get("cover-photo");
    expect(resolved).toBeDefined();
    if (!resolved) return;

    expect(resolved.src).toContain(".webp");
    expect(resolved.srcset).toBeDefined();
    expect(resolved.srcset).toContain("480w");
    expect(resolved.srcset).toContain("960w");
    expect(resolved.width).toBe(960);
    expect(resolved.height).toBe(480);
  });

  test("should return original URL for small images that cannot be optimized", async () => {
    const dataUrl = await createTestDataUrl(100, 100);

    const mockEntityService = createMockEntityService({
      returns: {
        getEntity: {
          id: "tiny-icon",
          entityType: "image",
          content: dataUrl,
          metadata: { format: "png", width: 100, height: 100 },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          contentHash: "tiny",
        },
      },
    });

    const service = new ImageBuildService(outputDir, mockEntityService, logger);
    await service.resolveAll(["tiny-icon"]);

    const resolved = service.get("tiny-icon");
    expect(resolved).toBeDefined();
    if (!resolved) return;

    expect(resolved.src).toBe("/images/tiny-icon.png");
    expect(resolved.srcset).toBeUndefined();
  });

  test("should return undefined for missing image entities", async () => {
    const mockEntityService = createMockEntityService({
      returns: { getEntity: null },
    });

    const service = new ImageBuildService(outputDir, mockEntityService, logger);
    await service.resolveAll(["missing-id"]);

    expect(service.get("missing-id")).toBeUndefined();
  });

  test("should deduplicate image IDs", async () => {
    const dataUrl = await createTestDataUrl(1000, 500);

    let callCount = 0;
    const mockEntityService = createMockEntityService();
    Object.defineProperty(mockEntityService, "getEntity", {
      value: () => {
        callCount++;
        return Promise.resolve({
          id: "shared",
          entityType: "image",
          content: dataUrl,
          metadata: { format: "png" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          contentHash: "hash",
        });
      },
      writable: true,
    });

    const service = new ImageBuildService(outputDir, mockEntityService, logger);
    await service.resolveAll(["shared", "shared", "shared"]);

    expect(callCount).toBe(1);
  });

  test("should provide full image map via getMap()", async () => {
    const dataUrl = await createTestDataUrl(1000, 500);

    const mockEntityService = createMockEntityService({
      returns: {
        getEntity: {
          id: "test",
          entityType: "image",
          content: dataUrl,
          metadata: { format: "png", width: 1000, height: 500 },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          contentHash: "hash",
        },
      },
    });

    const service = new ImageBuildService(outputDir, mockEntityService, logger);
    await service.resolveAll(["test"]);

    const map = service.getMap();
    expect(Object.keys(map)).toHaveLength(1);
    expect(map["test"]).toBeDefined();
  });

  describe("createImageRenderer", () => {
    test("should resolve entity://image refs in markdownToHtml", async () => {
      const dataUrl = await createTestDataUrl(2000, 1000);

      const mockEntityService = createMockEntityService({
        returns: {
          getEntity: {
            id: "photo",
            entityType: "image",
            content: dataUrl,
            metadata: { format: "png", width: 2000, height: 1000 },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "abc",
          },
        },
      });

      const service = new ImageBuildService(
        outputDir,
        mockEntityService,
        logger,
      );
      await service.resolveAll(["photo"]);

      const renderer = service.createImageRenderer();
      const html = markdownToHtml("![Alt](entity://image/photo)", {
        imageRenderer: renderer,
      });

      expect(html).toContain(".webp");
      expect(html).toContain("srcset=");
      expect(html).toContain('alt="Alt"');
      expect(html).toContain('loading="lazy"');
      expect(html).toContain('decoding="async"');
    });

    test("should fall back to default rendering for non-entity images", async () => {
      const mockEntityService = createMockEntityService();
      const service = new ImageBuildService(
        outputDir,
        mockEntityService,
        logger,
      );

      const renderer = service.createImageRenderer();
      const html = markdownToHtml("![Photo](https://example.com/img.png)", {
        imageRenderer: renderer,
      });

      expect(html).toContain('src="https://example.com/img.png"');
      expect(html).not.toContain("srcset");
    });

    test("should fall back for unresolved entity://image refs", async () => {
      const mockEntityService = createMockEntityService();
      const service = new ImageBuildService(
        outputDir,
        mockEntityService,
        logger,
      );

      const renderer = service.createImageRenderer();
      const html = markdownToHtml("![Missing](entity://image/unknown)", {
        imageRenderer: renderer,
      });

      // Returns undefined → marked uses its default rendering
      expect(html).toContain("entity://image/unknown");
    });
  });
});
