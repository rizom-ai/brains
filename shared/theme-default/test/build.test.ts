import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const packageDir = join(import.meta.dir, "..");

/**
 * The published artifact is dist-only (the repo's publish convention): the
 * theme.css text import cannot ship, so the build inlines it into a
 * dependency-free ESM module + declaration.
 */
describe("dist build", () => {
  it("emits a self-contained module that matches the source export", async () => {
    const build = Bun.spawnSync(["bun", "scripts/build.ts"], {
      cwd: packageDir,
    });
    expect(build.exitCode).toBe(0);

    const distPath = join(packageDir, "dist", "index.js");
    const dist = (await import(distPath)) as { default: string };
    const src = (await import(join(packageDir, "src", "index.ts"))) as {
      default: string;
    };

    expect(dist.default).toBe(src.default);
    // No ESM imports — the CSS is inlined (the CSS body itself may contain
    // `@import url(...)` font rules, which is fine).
    const distSource = await Bun.file(distPath).text();
    expect(distSource).not.toMatch(/^import /m);
  });
});
