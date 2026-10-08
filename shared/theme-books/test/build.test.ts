import { describe, expect, it } from "bun:test";
import { runProcess } from "@brains/utils/run-process";
import { join } from "node:path";
import { z } from "@brains/utils/zod";

/** The built and source modules must both export the CSS as a string. */
const themeModuleSchema = z.object({ default: z.string() });

const packageDir = join(import.meta.dir, "..");

/**
 * The published artifact is dist-only (the repo's publish convention): the
 * theme.css text import cannot ship, so the build inlines it into a
 * dependency-free ESM module + declaration.
 */
describe("dist build", () => {
  it("emits a self-contained module that matches the source export", async () => {
    const build = await runProcess(["bun", "scripts/build.ts"], {
      cwd: packageDir,
    });
    expect(build.exitCode).toBe(0);

    const distPath = join(packageDir, "dist", "index.js");
    const dist = themeModuleSchema.parse(await import(distPath));
    const src = themeModuleSchema.parse(
      await import(join(packageDir, "src", "index.ts")),
    );

    expect(dist.default).toBe(src.default);
    // No ESM imports — the CSS is inlined (the CSS body itself may contain
    // `@import url(...)` font rules, which is fine).
    const distSource = await Bun.file(distPath).text();
    expect(distSource).not.toMatch(/^import /m);
  });
});
