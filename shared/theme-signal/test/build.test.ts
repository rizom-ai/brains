import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const packageDir = join(import.meta.dir, "..");
const distDir = join(packageDir, "dist");

afterAll(() => {
  rmSync(distDir, { recursive: true, force: true });
});

describe("theme-signal build", () => {
  it("emits portable JavaScript and declarations", async () => {
    const result = Bun.spawnSync(["bun", "scripts/build.ts"], {
      cwd: packageDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(distDir, "index.js"))).toBe(true);
    expect(existsSync(join(distDir, "index.d.ts"))).toBe(true);

    const output = readFileSync(join(distDir, "index.js"), "utf8");
    expect(output).toContain('from "@rizom/theme-default"');
    expect(output).toContain("--signal-orange");
    expect(output).not.toContain('with { type: "text" }');
  });
});
