import { expect, test } from "bun:test";
import { runProcess } from "@brains/utils/run-process";

const published = ["index.js", "stylex.css"].map((name) =>
  Bun.file(new URL(`../dist/${name}`, import.meta.url)),
);

const readPublished = (): Promise<string[]> =>
  Promise.all(published.map((file) => file.text()));

/**
 * Host UI builds (Studio, dashboard) rebuild this package and read its dist in
 * parallel, so a reader must never see a file another build is still writing.
 */
async function readWhile(
  running: { done: boolean },
  initial: readonly string[],
  failures: string[],
): Promise<number> {
  if (running.done) return 0;
  try {
    const current = await readPublished();
    current.forEach((text, index) => {
      if (text !== initial[index])
        failures.push(`${published[index]?.name} changed mid-rebuild`);
    });
  } catch (error) {
    failures.push(String(error));
  }
  await Bun.sleep(0);
  return 1 + (await readWhile(running, initial, failures));
}

// Test subprocesses would inherit NODE_ENV=test, which changes the output bytes;
// every build here runs under one environment so its outputs are comparable.
const { NODE_ENV: _testEnv, ...env } = process.env;
const build = (cwd: string): ReturnType<typeof runProcess> =>
  runProcess([process.execPath, "run", "build"], { cwd, env });

test("concurrent rebuilds never expose a partial dist", async () => {
  const cwd = new URL("..", import.meta.url).pathname;
  expect((await build(cwd)).exitCode).toBe(0);
  const initial = await readPublished();
  expect(initial.every((text) => text.length > 0)).toBe(true);
  const running = { done: false };
  const builds = Promise.all(
    Array.from({ length: 3 }, () => build(cwd)),
  ).finally(() => {
    running.done = true;
  });
  const failures: string[] = [];
  const reads = await readWhile(running, initial, failures);
  for (const result of await builds) {
    expect(result.stderr).not.toContain("error:");
    expect(result.exitCode).toBe(0);
  }
  expect(reads).toBeGreaterThan(0);
  expect([...new Set(failures)]).toEqual([]);
}, 60_000);
