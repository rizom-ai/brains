import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { SiteBuilder } from "../../src/site-builder";
import { createSilentLogger } from "@brains/utils";
import { mkdirSync, existsSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

// Type for mocking Bun
type BunWithSpawn = { spawn: typeof Bun.spawn };

describe("SiteBuilder", () => {
  let siteBuilder: SiteBuilder;
  let testDir: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(import.meta.dir, "test-astro-site");
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Create a mock package.json
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "test-astro-site",
        scripts: {
          build: "echo 'mock build'",
          dev: "echo 'mock dev'",
        },
      }),
    );

    // Mock Bun.spawn
    originalSpawn = Bun.spawn;
    (Bun as unknown as BunWithSpawn).spawn = mock(
      (_args: string[], _options: unknown): ReturnType<typeof Bun.spawn> => {
        return {
          exited: Promise.resolve(0),
          stdout: new ReadableStream(),
          stderr: new ReadableStream(),
        } as unknown as ReturnType<typeof Bun.spawn>;
      },
    ) as unknown as typeof Bun.spawn;

    siteBuilder = new SiteBuilder({
      logger: createSilentLogger("test"),
      astroSiteDir: testDir,
    });
  });

  afterEach(() => {
    // Restore original spawn
    (Bun as unknown as BunWithSpawn).spawn = originalSpawn;

    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe("build", () => {
    it("should run astro build command", async () => {
      await siteBuilder.build();

      expect(Bun.spawn).toHaveBeenCalledWith(
        ["bun", "run", "build"],
        expect.objectContaining({
          cwd: testDir,
        }),
      );
    });

    it("should throw error if astro site doesn't exist", () => {
      const nonExistentDir = join(testDir, "non-existent");
      const builder = new SiteBuilder({
        logger: createSilentLogger("test"),
        astroSiteDir: nonExistentDir,
      });

      expect(builder.build()).rejects.toThrow(
        `Astro site not found at ${nonExistentDir}`,
      );
    });

    it("should throw error if package.json doesn't exist", () => {
      rmSync(join(testDir, "package.json"));

      expect(siteBuilder.build()).rejects.toThrow(
        `No package.json found in ${testDir}`,
      );
    });

    it("should throw error if build fails", () => {
      (Bun as unknown as BunWithSpawn).spawn = mock(
        (): ReturnType<typeof Bun.spawn> =>
          ({
            exited: Promise.resolve(1),
            stdout: new ReadableStream(),
            stderr: new Response("Build error").body,
          }) as unknown as ReturnType<typeof Bun.spawn>,
      ) as unknown as typeof Bun.spawn;

      expect(siteBuilder.build()).rejects.toThrow("Astro build failed");
    });
  });

  describe("hasBuild", () => {
    it("should return true if dist directory exists", () => {
      mkdirSync(join(testDir, "dist"));
      expect(siteBuilder.hasBuild()).toBe(true);
    });

    it("should return false if dist directory doesn't exist", () => {
      expect(siteBuilder.hasBuild()).toBe(false);
    });
  });

  describe("getDistDir", () => {
    it("should return correct dist directory path", () => {
      expect(siteBuilder.getDistDir()).toBe(join(testDir, "dist"));
    });
  });

  describe("clean", () => {
    it("should remove dist directory if it exists", async () => {
      const distDir = join(testDir, "dist");
      mkdirSync(distDir);
      writeFileSync(join(distDir, "index.html"), "<html></html>");

      // Mock spawn to actually remove the directory
      (Bun as unknown as BunWithSpawn).spawn = mock(
        (args: string[], _options: unknown): ReturnType<typeof Bun.spawn> => {
          if (args[0] === "rm" && args[1] === "-rf") {
            if (args[2]) rmSync(args[2], { recursive: true });
          }
          return {
            exited: Promise.resolve(0),
            stdout: new ReadableStream(),
            stderr: new ReadableStream(),
          } as unknown as ReturnType<typeof Bun.spawn>;
        },
      ) as unknown as typeof Bun.spawn;

      await siteBuilder.clean();

      expect(existsSync(distDir)).toBe(false);
      expect(Bun.spawn).toHaveBeenCalledWith(
        ["rm", "-rf", distDir],
        expect.objectContaining({
          cwd: testDir,
        }),
      );
    });

    it("should not fail if dist directory doesn't exist", async () => {
      await siteBuilder.clean();
      // Should not throw
    });
  });
});
