import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPreactBuilder } from "../../src/lib/preact-builder";
import { createSilentLogger } from "@brains/test-utils";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MockCSSProcessor } from "../mocks/mock-css-processor";

describe("PreactBuilder clean (preserve images)", () => {
  let testDir: string;
  let outputDir: string;
  let workingDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `clean-test-${Date.now()}`);
    outputDir = join(testDir, "output");
    workingDir = join(testDir, "working");
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("should preserve images/ directory during clean", async () => {
    const builder = createPreactBuilder({
      logger: createSilentLogger(),
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    // Set up output dir with HTML, CSS, and images
    await fs.mkdir(join(outputDir, "images"), { recursive: true });
    await fs.mkdir(join(outputDir, "styles"), { recursive: true });
    await fs.mkdir(join(outputDir, "blog/my-post"), { recursive: true });
    await fs.writeFile(join(outputDir, "index.html"), "<html>");
    await fs.writeFile(join(outputDir, "styles/main.css"), "body{}");
    await fs.writeFile(
      join(outputDir, "blog/my-post/index.html"),
      "<html>post</html>",
    );
    await fs.writeFile(join(outputDir, "images/photo.png"), "fake-png");
    await fs.writeFile(join(outputDir, "images/abc123-960w.webp"), "fake-webp");

    await builder.clean();

    // Images should survive
    const imagesExists = await fs
      .access(join(outputDir, "images"))
      .then(() => true)
      .catch(() => false);
    expect(imagesExists).toBe(true);

    const pngExists = await fs
      .access(join(outputDir, "images/photo.png"))
      .then(() => true)
      .catch(() => false);
    expect(pngExists).toBe(true);

    const webpExists = await fs
      .access(join(outputDir, "images/abc123-960w.webp"))
      .then(() => true)
      .catch(() => false);
    expect(webpExists).toBe(true);

    // HTML, CSS, and other dirs should be removed
    const htmlExists = await fs
      .access(join(outputDir, "index.html"))
      .then(() => true)
      .catch(() => false);
    expect(htmlExists).toBe(false);

    const stylesExists = await fs
      .access(join(outputDir, "styles"))
      .then(() => true)
      .catch(() => false);
    expect(stylesExists).toBe(false);

    const blogExists = await fs
      .access(join(outputDir, "blog"))
      .then(() => true)
      .catch(() => false);
    expect(blogExists).toBe(false);
  });

  it("should still remove working directory entirely", async () => {
    const builder = createPreactBuilder({
      logger: createSilentLogger(),
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    await fs.mkdir(workingDir, { recursive: true });
    await fs.writeFile(join(workingDir, "temp.js"), "code");

    await builder.clean();

    const workingExists = await fs
      .access(workingDir)
      .then(() => true)
      .catch(() => false);
    expect(workingExists).toBe(false);
  });

  it("should handle clean when images/ does not exist", async () => {
    const builder = createPreactBuilder({
      logger: createSilentLogger(),
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    // Output dir with no images/
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(join(outputDir, "index.html"), "<html>");

    await builder.clean();

    const htmlExists = await fs
      .access(join(outputDir, "index.html"))
      .then(() => true)
      .catch(() => false);
    expect(htmlExists).toBe(false);
  });

  it("should handle clean when output directory does not exist", async () => {
    const builder = createPreactBuilder({
      logger: createSilentLogger(),
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    // Don't create outputDir — clean should not throw
    await builder.clean();
  });
});
