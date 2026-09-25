import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { CanonicalTestLifetime } from "./fixtures/turso-canonical-lifetime";

test("retirement joins admitted work and finalizers before closing dependencies", async () => {
  const owner = new CanonicalTestLifetime();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const events: string[] = [];
  const work = owner.run(async () => {
    try {
      entered.resolve();
      await release.promise;
    } finally {
      events.push("App stopped");
    }
  });
  await entered.promise;
  const joined = owner.join();
  expect(owner.join()).toBe(joined);
  assert.throws(() => owner.run(async () => undefined), /retiring/);
  const cleanup = joined.then(() => {
    events.push("database closed");
  });
  try {
    await Promise.resolve();
    expect(events).toEqual([]);
  } finally {
    release.resolve();
  }
  await Promise.all([work, cleanup]);
  expect(events).toEqual(["App stopped", "database closed"]);
});

test("late failures preserve original identity while all admitted work is joined", async () => {
  const owner = new CanonicalTestLifetime();
  const failure = new Error("source failure");
  const cleanup = new Error("cleanup failure");
  const first = owner.run(async () => {
    throw failure;
  });
  const second = owner.run(async () => {
    throw cleanup;
  });
  await assert.rejects(first, (error: unknown) => error === failure);
  await assert.rejects(second, (error: unknown) => error === cleanup);
  await assert.rejects(owner.join(), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, failure);
    assert.deepEqual(error.errors, [failure, cleanup]);
    return true;
  });
});

test("a real Bun runner timeout stays failed while afterAll waits for App finalizers", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/turso-canonical-timeout-fixture.ts", import.meta.url),
  );
  const child = Bun.spawn([process.execPath, "test", fixture], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const output = stdout + stderr;
  expect(exit).not.toBe(0);
  expect(output).toContain("timed out after 20ms");
  expect(output).toContain("late source failure retained");
  expect(output).toContain("new database admission fenced");
  const app = output.indexOf("App cleanup observed open database");
  const database = output.indexOf("database joined after App cleanup");
  expect(app).toBeGreaterThanOrEqual(0);
  expect(database).toBeGreaterThan(app);
  expect(output).not.toContain("AssertionError");
});
