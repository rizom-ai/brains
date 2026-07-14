import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const packageDir = join(import.meta.dir, "..");

/**
 * The published artifact is dist-only: its own theme.css is inlined (text
 * imports cannot ship), while the base arrives through the real
 * `@rizom/theme-default` dependency so base fixes flow via npm resolution
 * instead of being frozen at this package's publish time.
 */
describe("dist build", () => {
  it("emits a module that inlines its CSS and imports the base", async () => {
    const build = Bun.spawnSync(["bun", "scripts/build.ts"], {
      cwd: packageDir,
    });
    expect(build.exitCode).toBe(0);

    const distPath = join(packageDir, "dist", "index.js");
    const dist = (await import(distPath)) as {
      default: string;
      themeCSS: string;
      themeCSSOnly: string;
    };
    const src = (await import(join(packageDir, "src", "index.ts"))) as {
      default: string;
      themeCSSOnly: string;
    };

    expect(dist.default).toBe(src.default);
    expect(dist.themeCSS).toBe(dist.default);
    expect(dist.themeCSSOnly).toBe(src.themeCSSOnly);

    const distSource = await Bun.file(distPath).text();
    // Own CSS inlined; base composed via the published dependency.
    expect(distSource).toContain('from "@rizom/theme-default"');
    expect(distSource).toContain("myc-root");
  });
});
