import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  TursoThreadProof,
  type ProofDriverOptions,
} from "./fixtures/turso-thread/client";
import { exerciseThreadDriver } from "./fixtures/turso-thread/exercise";
import { snapshotCommand } from "./fixtures/turso-thread/protocol";

const workerUrl = new URL("./fixtures/turso-thread/worker.ts", import.meta.url);
const directories: string[] = [];
const drivers: TursoThreadProof[] = [];
const failed = new Set<TursoThreadProof>();
function create(
  options: Omit<ProofDriverOptions, "workerUrl"> = { url: "file::memory:" },
): TursoThreadProof {
  const driver = new TursoThreadProof({ ...options, workerUrl });
  drivers.push(driver);
  return driver;
}
afterEach(async () => {
  try {
    for (const driver of drivers.splice(0)) {
      if (failed.has(driver)) await assert.rejects(driver.close());
      else await driver.close();
    }
  } finally {
    failed.clear();
    for (const directory of directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  }
});

describe("isolated Turso execution-thread proof", () => {
  it("proves placement, control-loop isolation, transactions and main-file-only recovery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "turso-thread-proof-"));
    directories.push(directory);
    const report = await exerciseThreadDriver(
      pathToFileURL(join(directory, "source with spaces.db")).href,
      workerUrl,
    );
    expect(report).toMatchObject({
      mainControlWhileWorkerBlocked: true,
      transactionIsolation: true,
      durableMainFileRestore: true,
      runtimeReplaced: false,
    });
  });

  it("reserves finalization capacity when ordinary requests fill the queue", async () => {
    const driver = create({ url: "file::memory:", maxInFlight: 1 });
    const lease = await driver.transaction();
    const queued = driver.execute({ sql: "SELECT 42 AS answer" });
    try {
      await assert.rejects(driver.execute({ sql: "SELECT 1" }), /overloaded/);
      const closing = driver.close();
      await lease.rollback();
      expect((await queued).rows[0]?.["answer"]).toBe(42);
      await closing;
    } finally {
      await lease.rollback();
    }
  });

  it("bounds queued bytes and rejects oversized commands without changing the session", async () => {
    const driver = create({ url: "file::memory:", maxPendingBytes: 400 });
    await assert.rejects(
      driver.execute({ sql: "SELECT ?", args: [new Uint8Array(65536)] }),
      /byte limit/,
    );
    const lease = await driver.transaction();
    const queued = driver.execute({ sql: "SELECT 42 AS answer" });
    try {
      await assert.rejects(driver.execute({ sql: "SELECT 1" }), /overloaded/);
    } finally {
      await lease.rollback();
    }
    expect((await queued).rows[0]?.["answer"]).toBe(42);
  });

  it("drains a transaction admitted before close but queued behind another lease", async () => {
    const driver = create();
    const first = await driver.transaction();
    const next = driver.transaction();
    const closing = driver.close();
    await first.rollback();
    const second = await next;
    try {
      expect(
        (await second.execute({ sql: "SELECT ? AS answer", args: [42] }))
          .rows[0]?.["answer"],
      ).toBe(42);
      await second.commit();
    } finally {
      await second.rollback();
    }
    await closing;
  });

  it("snapshots only a byte view, not its large backing allocation", () => {
    const backing = new Uint8Array(1024 * 1024);
    const view = backing.subarray(11, 14);
    view.set([0, 128, 255]);
    const command = snapshotCommand({
      op: "execute",
      statement: { sql: "SELECT ?", args: [view] },
    });
    assert.equal(command.op, "execute");
    assert.ok(Array.isArray(command.statement.args));
    const copied = command.statement.args[0];
    assert.ok(copied instanceof Uint8Array);
    expect(copied.buffer.byteLength).toBe(3);
    expect(Array.from(copied)).toEqual([0, 128, 255]);
    expect(backing.byteLength).toBe(1024 * 1024);
    view.fill(9);
    expect(Array.from(copied)).toEqual([0, 128, 255]);
  });

  it("keeps SQL and oversized-result failures local to the request", async () => {
    const driver = create();
    await assert.rejects(driver.execute({ sql: "SELECT * FROM absent" }));
    await assert.rejects(
      driver.execute({
        sql: "SELECT $value || $value || $value",
        args: { value: "x".repeat(24000) },
      }),
      /result byte limit/,
    );
    expect(
      (await driver.execute({ sql: "SELECT 42 AS answer" })).rows[0]?.[
        "answer"
      ],
    ).toBe(42);
  });

  it("does not accept a transaction lease on another execution owner", async () => {
    const first = create();
    const second = create();
    const lease = await first.transaction();
    try {
      await assert.rejects(
        second.execute({ sql: "SELECT 1" }, lease.id),
        /Unknown or finished/,
      );
      expect(
        (await lease.execute({ sql: "SELECT 42 AS answer" })).rows[0]?.[
          "answer"
        ],
      ).toBe(42);
    } finally {
      await lease.rollback();
    }
  });

  it("fails startup instead of falling back to a main-thread connection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "turso-thread-startup-"));
    directories.push(directory);
    const driver = create({
      url: pathToFileURL(join(directory, "missing", "database.db")).href,
    });
    failed.add(driver);
    await assert.rejects(driver.initialize());
    await assert.rejects(driver.execute({ sql: "SELECT 1" }));
  });

  it("fails all pending work after owner loss and never silently respawns", async () => {
    const driver = create();
    const lease = await driver.transaction();
    const pending = assert.rejects(
      driver.execute({ sql: "SELECT 1" }),
      /exited.*may have committed/,
    );
    failed.add(driver);
    await driver.terminateForProof();
    await pending;
    expect(lease.closed).toBe(true);
    await assert.rejects(lease.execute({ sql: "SELECT 3" }), /closed/);
    await assert.rejects(driver.initialize(), /exited/);
    await assert.rejects(driver.execute({ sql: "SELECT 2" }), /exited/);
  });

  it("retains the endpoint-only process fence before spawning", () => {
    const previous = process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"];
    process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] = "1";
    try {
      expect(() => create()).toThrow("forbidden");
    } finally {
      if (previous === undefined)
        delete process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"];
      else process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] = previous;
    }
  });
});
