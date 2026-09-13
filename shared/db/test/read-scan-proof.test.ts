import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ProofBudgetPool,
  type BudgetMember,
} from "./fixtures/turso-thread/budget-pool";
import { VERIFY_SCRATCH_BYTES } from "../src/turso-worker/blob-protocol";
import { deserializeError } from "../src/turso-worker/error-protocol";
import { TursoThreadProof } from "./fixtures/turso-thread/client";
import {
  scanEventSchema,
  type ScanEvent,
  type ScanRequest,
  type ScanFault,
  type ScanMaterialization,
  type ScanOutcome,
} from "./fixtures/turso-thread/read-scan-protocol";

const workerUrl = new URL(
  "./fixtures/turso-thread/read-scan-worker.ts",
  import.meta.url,
);
const nativeWorkerUrl = new URL(
  "./fixtures/turso-thread/worker.ts",
  import.meta.url,
);
const SIZE = 65539;
const SHA = "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f";
type Reply = Extract<ScanEvent, { kind: "reply" }>;
type Gate = Extract<ScanEvent, { kind: "gate" }>;
type Settled = Extract<ScanEvent, { kind: "settled" }>;
type Request = ScanRequest extends infer T
  ? T extends ScanRequest
    ? Omit<T, "id">
    : never
  : never;
class ScanHarness {
  public readonly worker: Worker;
  public readonly materialization: ScanMaterialization;
  public readonly pool = new ProofBudgetPool();
  public readonly member: BudgetMember;
  public readonly ready = Promise.withResolvers<void>();
  public readonly gates = {
    scan: Promise.withResolvers<Gate>(),
    rollback: Promise.withResolvers<Gate>(),
  };
  public readonly settled = Promise.withResolvers<Settled>();
  public readonly exit = Promise.withResolvers<number>();
  public exited = false;
  public failure: unknown;
  public terminal = false;
  private id = 0;
  private termination: Promise<void> | undefined;
  private readonly pending = new Map<
    number,
    ReturnType<typeof Promise.withResolvers<Reply>>
  >();
  public constructor(
    path: string,
    fault: ScanFault,
    materialization: ScanMaterialization,
  ) {
    this.materialization = materialization;
    this.member = this.pool.admit();
    try {
      this.worker = new Worker(workerUrl, {
        workerData: {
          url: pathToFileURL(path).href,
          generation: crypto.randomUUID(),
          pool: this.pool.id,
          fault,
          materialization,
        },
      });
    } catch (error) {
      this.member.cancelUnstarted();
      throw error;
    }
    this.member.bind(this.worker);
    // Some scenarios intentionally never reach rollback; startup/exit still
    // rejects all waiters without creating unhandled promise rejections.
    for (const deferred of [
      this.ready,
      this.gates.scan,
      this.gates.rollback,
      this.settled,
    ])
      void deferred.promise.catch(() => undefined);
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("message", (input: unknown) => {
      try {
        const event = scanEventSchema.parse(input);
        switch (event.kind) {
          case "ready":
            assert.equal(event.pid, process.pid);
            assert.equal(event.threadId, this.worker.threadId);
            this.ready.resolve();
            break;
          case "gate":
            this.gates[event.phase].resolve(event);
            break;
          case "release":
            assert.equal(event.id, 1);
            this.member.release(1, "resident");
            break;
          case "reply": {
            const pending = this.pending.get(event.id);
            assert(pending);
            this.pending.delete(event.id);
            pending.resolve(event);
            break;
          }
          case "settled":
            assert.equal(this.terminal, false);
            this.terminal = true;
            if (event.state.failed) this.member.fence();
            else this.member.release(2, "scratch");
            this.settled.resolve(event);
            break;
        }
      } catch (error) {
        this.fail(error);
      }
    });
    this.worker.once("exit", (code) => {
      this.exited = true;
      this.exit.resolve(code);
      const error =
        this.failure ?? new Error("Read scan worker exited before rendezvous");
      this.rejectWaiters(error);
    });
  }
  private rejectWaiters(error: unknown): void {
    this.ready.reject(error);
    this.gates.scan.reject(error);
    this.gates.rollback.reject(error);
    this.settled.reject(error);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  private fail(error: unknown): void {
    this.failure ??= error;
    this.member.fence();
    this.rejectWaiters(error);
  }
  public request(input: Request): Promise<Reply> {
    assert(this.pending.size < 16);
    assert(!this.exited);
    const id = ++this.id;
    const pending = Promise.withResolvers<Reply>();
    this.pending.set(id, pending);
    this.worker.postMessage({ ...input, id });
    return pending.promise;
  }
  public waitGate(phase: "scan" | "rollback"): Promise<Gate> {
    return Promise.race([
      this.gates[phase].promise,
      this.settled.promise.then((result) => {
        throw new Error(`Read settled before expected ${phase} gate`, {
          cause: result.read.ok
            ? undefined
            : deserializeError(result.read.error),
        });
      }),
    ]);
  }
  public async start(): Promise<Gate> {
    await this.ready.promise;
    const resident = this.member.reserve(1, { kind: "resident", bytes: SIZE });
    const scratch = this.member.reserve(2, {
      kind: "scratch",
      bytes: VERIFY_SCRATCH_BYTES,
    });
    successful(
      (await this.request({ op: "start", resident, scratch })).outcome,
    );
    return this.waitGate("scan");
  }
  public terminate(): Promise<void> {
    this.termination ??= this.stop();
    return this.termination;
  }
  private async stop(): Promise<void> {
    if (!this.exited) await this.worker.terminate();
    await this.exit.promise;
  }
}
function successful(outcome: ScanOutcome): void {
  if (!outcome.ok) throw deserializeError(outcome.error);
}
function failure(outcome: ScanOutcome): Error {
  assert(!outcome.ok);
  return deserializeError(outcome.error);
}
const fixtures: {
  harness: ScanHarness;
  directory: string;
  path: string;
  retain: boolean;
}[] = [];
async function createFixture(
  materialization: ScanMaterialization,
  fault: ScanFault,
): Promise<(typeof fixtures)[number]> {
  const directory = await mkdtemp(join(tmpdir(), "read-scan-proof-"));
  const path = join(directory, "source.db");
  try {
    const fixture = {
      harness: new ScanHarness(path, fault, materialization),
      directory,
      path,
      retain: true, // Retain on interrupted/failed checks until recovery is verified.
    };
    fixtures.push(fixture);
    return fixture;
  } catch (error) {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Read scan startup and directory cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
}
afterEach(async () => {
  const errors: unknown[] = [];
  for (const fixture of fixtures.splice(0)) {
    try {
      await fixture.harness.terminate();
      if (!fixture.retain)
        await rm(fixture.directory, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    } // Failed join retains recovery files.
    if (fixture.harness.failure !== undefined)
      errors.push(fixture.harness.failure);
  }
  if (errors.length)
    throw new AggregateError(errors, "Read scan fixture cleanup failed", {
      cause: errors[0],
    });
});
async function assertRecovery(
  fixture: (typeof fixtures)[number],
  uncertain: boolean,
  writes: number,
): Promise<void> {
  assert(fixture.harness.exited);
  // Uncertain-owner recovery retains original WAL. Only a confirmed normal close
  // permits the separate main-file-only restore path.
  let path = fixture.path;
  if (!uncertain) {
    path = join(fixture.directory, "restored.db");
    await copyFile(fixture.path, path);
  }
  const driver = new TursoThreadProof({
    url: pathToFileURL(path).href,
    workerUrl: nativeWorkerUrl,
  });
  try {
    assert.deepEqual(
      await driver.verifyBlob({
        table: "scan_blobs",
        column: "bytes",
        key: [{ column: "id", value: 1 }],
        maxBytes: SIZE,
      }),
      { sizeBytes: SIZE, sha256: SHA },
    );
    assert.equal(
      (await driver.execute({ sql: "SELECT count(*) AS n FROM scan_progress" }))
        .rows[0]?.["n"],
      writes,
    );
  } catch (error) {
    try {
      await driver.close();
    } catch (cleanup) {
      fixture.retain = true;
      throw new AggregateError(
        [error, cleanup],
        `Scan recovery close unconfirmed; retained ${fixture.directory}`,
        { cause: cleanup },
      );
    }
    throw error;
  }
  try {
    await driver.close();
  } catch (error) {
    fixture.retain = true;
    throw new Error(
      `Scan recovery close unconfirmed; retained ${fixture.directory}`,
      { cause: error },
    );
  }
  fixture.retain = false;
}
async function prepare(harness: ScanHarness): Promise<void> {
  const gate = await harness.start();
  assert.equal(gate.state.materialization, harness.materialization);
  assert.equal(gate.state.queryCalls, 2);
  assert.equal(
    gate.state.gatedBackingBytes,
    harness.materialization === "adopt" ? SIZE : 0,
  );
  assert.equal(gate.state.nativeActive, true);
  assert.equal(gate.state.reads.preparing, 1);
  assert.equal(gate.state.scratchSlots, 1);
  successful((await harness.request({ op: "queue" })).outcome);
  assert.match(
    failure((await harness.request({ op: "claim" })).outcome).message,
    /not available for streaming/,
  );
}
async function normalClose(harness: ScanHarness): Promise<void> {
  successful((await harness.request({ op: "shutdown" })).outcome);
  assert.equal(await harness.exit.promise, 0);
  assert.equal(harness.pool.stats().residentBytes, 0);
  assert.equal(harness.pool.stats().scratchBytes, 0);
}

describe.each(["incremental", "adopt"] as const)(
  "active native %s read lifecycle (component fault proof)",
  (materialization) => {
    function create(
      fault: ScanFault = "none",
    ): Promise<(typeof fixtures)[number]> {
      return createFixture(materialization, fault);
    }
    const interruptedQueries = materialization === "adopt" ? 2 : 3;
    const completeQueries = materialization === "adopt" ? 2 : 4;
    it("reclaims an interrupted active scan on actual worker exit, not a termination request", async () => {
      const fixture = await create();
      const harness = fixture.harness;
      await prepare(harness);
      const rejected = assert.rejects(
        harness.settled.promise,
        /worker exited before rendezvous/,
      );
      harness.member.fence();
      const allowExit = Promise.withResolvers<void>();
      const requested = Promise.withResolvers<void>();
      const terminate = harness.worker.terminate.bind(harness.worker);
      harness.worker.terminate = async (): Promise<number> => {
        requested.resolve();
        await allowExit.promise;
        return terminate();
      };
      try {
        const stopping = harness.terminate();
        await requested.promise;
        const pending = await harness.request({ op: "inspect" });
        successful(pending.outcome);
        expect(pending.state.reads.preparing).toBe(1);
        assert.equal(pending.state.nativeActive, true);
        assert.equal(pending.state.queuedNativeCalls, 0);
        assert.equal(harness.pool.stats().residentBytes, SIZE);
        assert.equal(harness.pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
        allowExit.resolve();
        await stopping;
        await rejected;
      } finally {
        allowExit.resolve();
        await harness.terminate();
      }
      assert.equal(harness.pool.stats().residentBytes, 0);
      assert.equal(harness.pool.stats().scratchBytes, 0);
      await assertRecovery(fixture, true, 0);
    });
    it.each(["scope", "discard", "all"] as const)(
      "retains backing and scratch after active %s revocation until rollback acknowledgement",
      async (method) => {
        const fixture = await create();
        const harness = fixture.harness;
        await prepare(harness);
        const revoked = await harness.request({ op: "revoke", method });
        successful(revoked.outcome);
        expect(revoked.state.reads.reservedBytes).toBe(SIZE);
        assert.equal(harness.pool.stats().residentBytes, SIZE);
        assert.equal(harness.pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
        successful(
          (await harness.request({ op: "resume", phase: "scan" })).outcome,
        );
        const rollback = await harness.waitGate("rollback");
        assert.equal(rollback.state.queryCalls, interruptedQueries); // Only the already-admitted operation may finish.
        assert.equal(rollback.state.queuedNativeCalls, 0);
        assert.equal(rollback.state.rollbackCompleted, 0);
        assert.equal(harness.terminal, false);
        assert.equal(harness.pool.stats().residentBytes, SIZE);
        successful(
          (await harness.request({ op: "resume", phase: "rollback" })).outcome,
        );
        const result = await harness.settled.promise;
        assert.match(failure(result.read).message, /Read scope revoked/);
        successful(result.write);
        assert.equal(result.state.rollbackCompleted, 1);
        assert.equal(result.state.nativeActive, false);
        assert.equal(result.state.reads.reads, 0);
        assert.equal(harness.pool.stats().residentBytes, 0);
        assert.equal(harness.pool.stats().scratchBytes, 0);
        await normalClose(harness);
        await assertRecovery(fixture, false, 1);
      },
    );
    it.each([false, true])(
      "withholds a complete scan capability through rollback (revoked during rollback: %j)",
      async (revoke) => {
        const fixture = await create();
        const harness = fixture.harness;
        await prepare(harness);
        successful(
          (await harness.request({ op: "resume", phase: "scan" })).outcome,
        );
        const rollback = await harness.waitGate("rollback");
        expect(rollback.state.queryCalls).toBe(completeQueries);
        assert.equal(rollback.state.nativeActive, true);
        assert.match(
          failure((await harness.request({ op: "claim" })).outcome).message,
          /not available/,
        );
        if (revoke)
          successful(
            (await harness.request({ op: "revoke", method: "scope" })).outcome,
          );
        assert.equal(harness.pool.stats().residentBytes, SIZE);
        assert.equal(harness.pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
        successful(
          (await harness.request({ op: "resume", phase: "rollback" })).outcome,
        );
        const result = await harness.settled.promise;
        successful(result.write);
        if (revoke) {
          assert.match(failure(result.read).message, /revoked/);
          assert.equal(harness.pool.stats().residentBytes, 0);
        } else {
          successful(result.read);
          assert(result.read.ok && result.read.value);
          assert.equal(result.read.value.sha256, SHA);
          assert.equal(harness.pool.stats().residentBytes, SIZE);
          successful((await harness.request({ op: "claim" })).outcome);
          successful(
            (await harness.request({ op: "revoke", method: "discard" }))
              .outcome,
          );
        }
        assert.equal(harness.pool.stats().scratchBytes, 0);
        await normalClose(harness);
        await assertRecovery(fixture, false, 1);
      },
    );
    it("keeps a controlled active query rejection local only after acknowledged rollback", async () => {
      const fixture = await create("query");
      const harness = fixture.harness;
      await prepare(harness);
      successful(
        (await harness.request({ op: "resume", phase: "scan" })).outcome,
      );
      const rollback = await harness.waitGate("rollback");
      expect(rollback.state.failed).toBe(false);
      assert.equal(harness.terminal, false);
      assert.equal(harness.pool.stats().residentBytes, SIZE);
      successful(
        (await harness.request({ op: "resume", phase: "rollback" })).outcome,
      );
      const result = await harness.settled.promise;
      assert.match(
        failure(result.read).message,
        /Injected active scan query failure/,
      );
      successful(result.write);
      assert.equal(result.state.queryCalls, interruptedQueries);
      assert.equal(result.state.rollbackCompleted, 1);
      await normalClose(harness);
      await assertRecovery(fixture, false, 1);
    });
    it.each([
      "rollback-before",
      "rollback-after",
      "query-rollback",
      "statement-ack",
      "native-state-loss",
    ] as const)(
      "fences %s without releasing uncertain grants or running the queued write",
      async (fault) => {
        const fixture = await create(fault);
        const harness = fixture.harness;
        await prepare(harness);
        if (fault.startsWith("rollback"))
          successful(
            (await harness.request({ op: "revoke", method: "scope" })).outcome,
          );
        successful(
          (await harness.request({ op: "resume", phase: "scan" })).outcome,
        );
        const skipsRollback =
          fault === "statement-ack" || fault === "native-state-loss";
        if (!skipsRollback) {
          await harness.waitGate("rollback");
          assert.equal(harness.pool.stats().residentBytes, SIZE);
          assert.equal(harness.pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
          successful(
            (await harness.request({ op: "resume", phase: "rollback" }))
              .outcome,
          );
        }
        const result = await harness.settled.promise;
        expect(result.state.failed).toBe(true);
        assert.equal(result.state.queuedNativeCalls, 0);
        assert.equal(result.state.queryCalls, interruptedQueries);
        assert.match(failure(result.write).message, /cannot be reused/);
        assert.equal(result.state.rollbackCalls, skipsRollback ? 0 : 1);
        assert.equal(
          result.state.rollbackCompleted,
          fault === "rollback-after" || fault === "query-rollback" ? 1 : 0,
        );
        assert.equal(
          result.state.nativeActive,
          fault === "statement-ack" || fault === "rollback-before",
        );
        const error = failure(result.read);
        assert(error instanceof AggregateError);
        assert.equal(error.cause, error.errors[1]);
        assert(!result.read.ok);
        if (skipsRollback) {
          assert.equal(error.errors[0], error.errors[1]);
          assert.match(String(error.errors[0]), /cannot be reused/);
          if (fault === "statement-ack")
            assert(
              result.read.error.nodes.some((node) =>
                /Injected statement finalization acknowledgement loss/.test(
                  node.message,
                ),
              ),
            );
          if (fault === "native-state-loss") {
            assert(
              result.read.error.nodes.some((node) =>
                /integer overflow/i.test(node.message),
              ),
              JSON.stringify(result.read.error),
            );
            assert(
              result.read.error.nodes.some((node) =>
                /Native transaction state changed/.test(node.message),
              ),
            );
          }
        } else {
          assert.match(
            String(error.errors[0]),
            fault === "query-rollback"
              ? /active scan query failure/
              : /Read scope revoked/,
          );
          const cleanup: unknown = error.errors[1];
          assert(cleanup instanceof Error);
          assert.match(cleanup.message, /transaction rollback/);
          assert(cleanup.cause instanceof Error);
          assert.match(
            cleanup.cause.message,
            fault === "rollback-before"
              ? /failure before native call/
              : /acknowledgement loss after native completion/,
          );
        }
        assert.equal(result.state.reads.reservedBytes, 0); // Local backing drop is not a parent release acknowledgement.
        assert.equal(result.state.scratchSlots, 0);
        assert.equal(harness.pool.stats().residentBytes, SIZE);
        assert.equal(harness.pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
        assert.match(
          failure((await harness.request({ op: "shutdown" })).outcome).message,
          /cannot be reused/,
        );
        assert.equal(harness.exited, false);
        const allowExit = Promise.withResolvers<void>();
        const requested = Promise.withResolvers<void>();
        const terminate = harness.worker.terminate.bind(harness.worker);
        harness.worker.terminate = async (): Promise<number> => {
          requested.resolve();
          await allowExit.promise;
          return terminate();
        };
        try {
          const stopping = harness.terminate();
          await requested.promise;
          assert.equal(harness.pool.stats().residentBytes, SIZE);
          assert.equal(harness.pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
          assert.throws(
            () => harness.member.reserve(3, { kind: "resident", bytes: 1 }),
            /not live/,
          );
          allowExit.resolve();
          await stopping;
        } finally {
          allowExit.resolve();
          await harness.terminate();
        }
        assert.equal(harness.pool.stats().residentBytes, 0);
        assert.equal(harness.pool.stats().scratchBytes, 0);
        await assertRecovery(fixture, true, 0);
      },
    );
  },
);
