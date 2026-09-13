import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { ImageOptimizer } from "../src/image-optimizer";
import { createSilentLogger } from "@brains/test-utils";
import { createTestPng } from "./helpers/test-png";

/**
 * Let enough wall-clock pass that a rewrite would show a different mtime.
 *
 * A real duration, and not one that can be waited away: the assertion is that
 * the cached files were *not* rewritten, which is read from their mtime. Two
 * writes inside the filesystem's timestamp granularity are indistinguishable,
 * so without this gap the check could pass on a rewrite.
 */
async function pastFilesystemMtimeGranularity(): Promise<void> {
  await Bun.sleep(50);
}

describe("ImageOptimizer", () => {
  const logger = createSilentLogger();
  let imagesDir: string;

  beforeEach(async () => {
    const testDir = mkdtempSync(join(tmpdir(), "image-optimizer-test-"));
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

      const hash = createHash("sha256")
        .update(buffer)
        .digest("hex")
        .slice(0, 16);
      const files = (await fs.readdir(imagesDir)).sort();
      expect(files).toEqual([
        `${hash}-1920w.webp`,
        `${hash}-480w.webp`,
        `${hash}-960w.webp`,
      ]);

      for (const width of [480, 960, 1920]) {
        const variant = await fs.readFile(
          join(imagesDir, `${hash}-${width}w.webp`),
        );
        const metadata = await new Bun.Image(variant).metadata();
        expect(metadata).toMatchObject({
          format: "webp",
          width,
          height: width / 2,
        });
        expect(variant.subarray(0, 4).toString("ascii")).toBe("RIFF");
        expect(variant.subarray(8, 12).toString("ascii")).toBe("WEBP");
      }
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
      const files = await fs.readdir(imagesDir);
      expect(files).toHaveLength(1);
      const metadata = await new Bun.Image(
        await fs.readFile(join(imagesDir, files[0] ?? "missing")),
      ).metadata();
      expect(metadata).toMatchObject({ width: 480, height: 360 });
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

      await pastFilesystemMtimeGranularity();

      // Second call should use cache
      const result2 = await optimizer.optimize(buffer, "/images/photo.png");
      expect(result2).not.toBeNull();
      if (!result2) return;
      expect(result2.srcset).toBe(result1.srcset);

      // Files should not have been rewritten
      for (const f of files) {
        const stat = await fs.stat(join(imagesDir, f));
        const recorded = mtimes.get(f);
        if (recorded === undefined) throw new Error(`No mtime recorded: ${f}`);
        expect(stat.mtimeMs).toBe(recorded);
      }
    });

    test("should produce valid WebP files", async () => {
      const buffer = await createTestPng(1000, 500);
      const optimizer = new ImageOptimizer(imagesDir, logger);

      await optimizer.optimize(buffer, "/images/test.png");

      const files = await fs.readdir(imagesDir);
      for (const f of files.filter((name) => name.endsWith(".webp"))) {
        const webpBuffer = await fs.readFile(join(imagesDir, f));
        const meta = await new Bun.Image(webpBuffer).metadata();
        expect(meta.format).toBe("webp");
      }
    });
  });

  describe("optimizeAll", () => {
    test("should optimize all PNG/JPEG files in directory", async () => {
      // Write test images to the images directory
      const png = await createTestPng(1200, 800);
      const jpeg = await new Bun.Image(await createTestPng(2000, 1000))
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
