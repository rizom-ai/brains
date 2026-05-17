import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preferLocalUrlsForRuntime } from "../src/runtime-env";

const originalNodeEnv = process.env["NODE_ENV"];

function restoreNodeEnv(): void {
  if (originalNodeEnv === undefined) {
    delete process.env["NODE_ENV"];
  } else {
    process.env["NODE_ENV"] = originalNodeEnv;
  }
}

describe("runtime environment helpers", () => {
  it("prefers public URLs when runtime NODE_ENV is production", () => {
    process.env["NODE_ENV"] = "production";
    try {
      expect(preferLocalUrlsForRuntime()).toBe(false);
    } finally {
      restoreNodeEnv();
    }
  });

  it("keeps NODE_ENV dynamic after Bun bundling", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "brain-runtime-env-"));
    try {
      const entrypoint = join(testDir, "entry.ts");
      const outfile = join(testDir, "out.js");
      await writeFile(
        entrypoint,
        `import { preferLocalUrlsForRuntime } from ${JSON.stringify(join(import.meta.dir, "..", "src", "runtime-env.ts"))};\nconsole.log(String(preferLocalUrlsForRuntime()));\n`,
      );

      const result = await Bun.build({
        entrypoints: [entrypoint],
        target: "bun",
        format: "esm",
        minify: true,
      });
      expect(result.success).toBe(true);
      const output = result.outputs[0];
      if (!output) {
        throw new Error("Bun build produced no output");
      }
      await writeFile(outfile, await output.text());

      const productionRun = spawnSync("bun", [outfile], {
        env: { ...process.env, NODE_ENV: "production" },
        encoding: "utf8",
      });
      expect(productionRun.status).toBe(0);
      expect(productionRun.stdout.trim()).toBe("false");

      const localRun = spawnSync("bun", [outfile], {
        env: { ...process.env, NODE_ENV: "development" },
        encoding: "utf8",
      });
      expect(localRun.status).toBe(0);
      expect(localRun.stdout.trim()).toBe("true");
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });
});
