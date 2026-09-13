import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess, runProcessOrThrow } from "@brains/utils/run-process";

test("concurrent UI rebuilds keep published CSS readable", async () => {
  const cwd = join(import.meta.dir, "..");
  const outdir = await mkdtemp(join(tmpdir(), "studio-concurrent-ui-"));
  const command = [process.execPath, "run", "build", "--outdir", outdir];
  try {
    // Own the test's destination; never rebuild another test's or app's assets.
    await runProcessOrThrow(command, { cwd });
    const css = Bun.file(join(outdir, "studio-app.css"));
    const initial = await css.text();
    const manifest = Bun.file(join(outdir, "studio-asset-manifest.json"));
    const initialManifest = await manifest.text();
    expect(initial.length).toBeGreaterThan(0);
    const state = { finished: false };
    const builds = Promise.all([
      runProcess(command, { cwd }),
      runProcess(command, { cwd }),
    ]).finally(() => {
      state.finished = true;
    });
    const failures: string[] = [];
    let reads = 0;
    while (!state.finished) {
      try {
        if ((await css.text()) !== initial)
          failures.push("Published CSS changed during an identical rebuild");
      } catch (error) {
        failures.push(String(error));
      }
      reads += 1;
      await Bun.sleep(5);
    }
    for (const result of await builds) {
      expect(result.stderr).not.toContain("error:");
      expect(result.exitCode).toBe(0);
    }
    expect(reads).toBeGreaterThan(0);
    expect(failures).toEqual([]);
    expect(await manifest.text()).toBe(initialManifest);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}, 120_000);
