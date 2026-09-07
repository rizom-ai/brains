import { expect, test } from "bun:test";
import { runProcess } from "@brains/utils/run-process";

test("concurrent UI rebuilds keep published CSS readable", async () => {
  const cwd = new URL("..", import.meta.url).pathname;
  const css = Bun.file(new URL("../dist/ui/studio-app.css", import.meta.url));
  const initial = await css.text();
  expect(initial.length).toBeGreaterThan(0);
  const state = { finished: false };
  const builds = Promise.all([
    runProcess([process.execPath, "run", "build"], { cwd }),
    runProcess([process.execPath, "run", "build"], { cwd }),
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
}, 120_000);
