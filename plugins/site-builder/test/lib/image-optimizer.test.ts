import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import sharp from "sharp";
import { ImageOptimizer } from "../../src/lib/image-optimizer";
import { createSilentLogger } from "@brains/test-utils";

/** Create a real PNG buffer of a given size using sharp */
async function createTestPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 64, b: 32 },
    },
  })
    .png()
    .toBuffer();
}

describe("ImageOptimizer", () => {
  const logger = createSilentLogger();
  let imagesDir: string;

  beforeEach(async () => {
    const testDir = join(tmpdir(), `image-optimizer-test-${Date.now()}`);
    imagesDir = join(testDir, "images");
    await fs.mkdir(imagesDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      // imagesDir is <testDir>/images, go up one level to clean everything
      await fs.rm(join(imagesDir, ".."), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("optimize", () => {
    test("should create WebP variants for a large image", async () => {
      const buffer = await createTestPng(2000, 1000);
      const optimizer = new ImageOptimizer(imagesDir, logger);

      const result = await optimizer.optimize(buffer, "/images/photo.png");

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.srcset).toContain("480w");
      expect(result.srcset).toContain("960w");
      expect(result.srcset).toContain("1920w");
      expect(result.src).toContain("960w.webp");
      expect(result.sizes).toBe(
        "(max-width: 640px) 480px, (max-width: 1280px) 960px, 1920px",
      );
      expect(result.width).toBe(960);
      expect(result.height).toBe(480); // 960 * (1000/2000)

      // Verify files exist on disk
      const files = await fs.readdir(imagesDir);
      const webpFiles = files.filter((f) => f.endsWith(".webp"));
      expect(webpFiles).toHaveLength(3);
    });

    test("should skip variants larger than source width", async () => {
      const buffer = await createTestPng(800, 600);
      const optimizer = new ImageOptimizer(imagesDir, logger);

      const result = await optimizer.optimize(buffer, "/images/small.png");

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.srcset).toContain("480w");
      expect(result.srcset).not.toContain("960w");
      expect(result.srcset).not.toContain("1920w");
      // Fallback should be the largest available (480w)
      expect(result.src).toContain("480w.webp");
    });

    test("should return null for images smaller than all variants", async () => {
      const buffer = await createTestPng(100, 100);
      const optimizer = new ImageOptimizer(imagesDir, logger);

      const result = await optimizer.optimize(buffer, "/images/tiny.png");

      expect(result).toBeNull();
    });

    test("should use filesystem cache on second call", async () => {
      const buffer = await createTestPng(2000, 1000);
      const optimizer = new ImageOptimizer(imagesDir, logger);

      // First call creates files
      const result1 = await optimizer.optimize(buffer, "/images/photo.png");
      expect(result1).not.toBeNull();
      if (!result1) return;

      // Get mtimes after first call
      const files = await fs.readdir(imagesDir);
      const mtimes = new Map<string, number>();
      for (const f of files) {
        const stat = await fs.stat(join(imagesDir, f));
        mtimes.set(f, stat.mtimeMs);
      }

      // Small delay to ensure mtime would differ
      await new Promise((r) => setTimeout(r, 50));

      // Second call should use cache
      const result2 = await optimizer.optimize(buffer, "/images/photo.png");
      expect(result2).not.toBeNull();
      if (!result2) return;
      expect(result2.srcset).toBe(result1.srcset);

      // Files should not have been rewritten
      for (const f of files) {
        const stat = await fs.stat(join(imagesDir, f));
        expect(stat.mtimeMs).toBe(mtimes.get(f) as number);
      }
    });

    test("should produce valid WebP files", async () => {
      const buffer = await createTestPng(1000, 500);
      const optimizer = new ImageOptimizer(imagesDir, logger);

      await optimizer.optimize(buffer, "/images/test.png");

      const files = await fs.readdir(imagesDir);
      for (const f of files.filter((name) => name.endsWith(".webp"))) {
        const webpBuffer = await fs.readFile(join(imagesDir, f));
        const meta = await sharp(webpBuffer).metadata();
        expect(meta.format).toBe("webp");
      }
    });
  });

  describe("optimizeAll", () => {
    test("should optimize all PNG/JPEG files in directory", async () => {
      // Write test images to the images directory
      const png = await createTestPng(1200, 800);
      const jpeg = await sharp({
        create: {
          width: 2000,
          height: 1000,
          channels: 3,
          background: { r: 200, g: 100, b: 50 },
        },
      })
        .jpeg()
        .toBuffer();

      await fs.writeFile(join(imagesDir, "photo.png"), png);
      await fs.writeFile(join(imagesDir, "banner.jpeg"), jpeg);

      const optimizer = new ImageOptimizer(imagesDir, logger);
      const variantsMap = await optimizer.optimizeAll();

      expect(Object.keys(variantsMap)).toHaveLength(2);
      expect(variantsMap["/images/photo.png"]).toBeDefined();
      expect(variantsMap["/images/banner.jpeg"]).toBeDefined();
    });

    test("should skip WebP files (already optimized)", async () => {
      const png = await createTestPng(1000, 500);
      await fs.writeFile(join(imagesDir, "already.webp"), png);

      const optimizer = new ImageOptimizer(imagesDir, logger);
      const variantsMap = await optimizer.optimizeAll();

      expect(Object.keys(variantsMap)).toHaveLength(0);
    });

    test("should return empty map for empty directory", async () => {
      const optimizer = new ImageOptimizer(imagesDir, logger);
      const variantsMap = await optimizer.optimizeAll();

      expect(Object.keys(variantsMap)).toHaveLength(0);
    });

    test("should return empty map for non-existent directory", async () => {
      const optimizer = new ImageOptimizer("/tmp/does-not-exist", logger);
      const variantsMap = await optimizer.optimizeAll();

      expect(Object.keys(variantsMap)).toHaveLength(0);
    });
  });
});
