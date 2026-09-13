import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { NetworkProcessOwner } from "./fixtures/turso-thread/network-process-owner";
import { readPauseAfterSchema } from "./fixtures/turso-thread/network-read-protocol";
import {
  STAGE_CHUNK_BYTES,
  STAGE_BUDGET_BYTES,
} from "./fixtures/turso-thread/binary-protocol";
import {
  exerciseNetworkArtifactFailure,
  type NetworkSidecars,
} from "./fixtures/turso-thread/network-exercise";

const workerUrl = new URL("./fixtures/turso-thread/worker.ts", import.meta.url);
const bridgeUrl = new URL(
  "./fixtures/turso-thread/network-ingress-worker.ts",
  import.meta.url,
);
const producerUrl = new URL(
  "./fixtures/turso-thread/network-producer.ts",
  import.meta.url,
);
import {
  exerciseNetworkReadArtifactFailure,
  type NetworkReadSidecars,
} from "./fixtures/turso-thread/network-read-exercise";
const readBridgeUrl = new URL(
  "./fixtures/turso-thread/network-read-worker.ts",
  import.meta.url,
);
const readConsumerUrl = new URL(
  "./fixtures/turso-thread/network-read-consumer.ts",
  import.meta.url,
);
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("explicit network sidecars and process ownership", () => {
  it.each(["delayed", "rejected"] as const)(
    "does not refund or retry a %s test-owned SIGKILL request before exit",
    async (mode) => {
      const requested = Promise.withResolvers<() => void>();
      const failure = new Error("Injected proof kill request failure");
      class ControlledKill extends NetworkProcessOwner {
        public requests = 0;
        protected override requestTermination(request: () => void): void {
          this.requests++;
          requested.resolve(request);
          if (mode === "rejected") throw failure;
        }
      }
      const owner = new ControlledKill(
        process.execPath,
        readConsumerUrl,
        "read",
      );
      const child = owner.spawn();
      const killed = child.killForProof();
      void killed.catch(() => undefined); // Asserted below, including retained rejection after actual exit.
      try {
        expect(child.killForProof()).toBe(killed);
        assert.equal(owner.stats().children, 1);
        assert.equal(owner.requests, 1);
        assert.throws(
          () =>
            child.start({
              direction: "read",
              endpoint: {
                host: "127.0.0.1",
                port: 1,
                token: "0".repeat(64),
                direction: "read",
              },
              facts: { sizeBytes: 0, sha256: "0".repeat(64) },
            }),
          /bootstrap is not available/,
        );
        if (mode === "rejected") {
          await assert.rejects(killed, (error: unknown) => error === failure);
          assert.deepEqual(owner.stats(), { children: 1, fenced: true });
          assert.throws(() => owner.spawn(), /fenced/);
        }
      } finally {
        // Explicit release/recovery of this exact test-owned subprocess handle,
        // not a retry by killForProof, a PID lookup or an inferred exit.
        (await requested.promise)();
        await child.exited;
      }
      assert.equal(owner.stats().children, 0);
      assert.equal(owner.requests, 1);
      assert.equal(child.killForProof(), killed);
      if (mode === "rejected") {
        await assert.rejects(killed, (error: unknown) => error === failure);
        await assert.rejects(
          owner.close(),
          (error: unknown) => error === failure,
        );
      } else {
        assert.notEqual(await killed, 0);
        await owner.close();
      }
    },
  );
  it("bounds deterministic read checkpoints without changing transfer chunk size", () => {
    expect(readPauseAfterSchema.parse(17 * 1024 * 1024)).toBe(17 * 1024 * 1024);
    assert.equal(
      readPauseAfterSchema.parse(STAGE_BUDGET_BYTES),
      STAGE_BUDGET_BYTES,
    );
    for (const invalid of [
      0,
      -1,
      STAGE_CHUNK_BYTES + 1,
      STAGE_BUDGET_BYTES + STAGE_CHUNK_BYTES,
      Infinity,
    ])
      assert.equal(readPauseAfterSchema.safeParse(invalid).success, false);
  });
  it("rejects a direction-mismatched bootstrap before delivering authority", async () => {
    const owner = new NetworkProcessOwner(
      process.execPath,
      readConsumerUrl,
      "read",
    );
    const child = owner.spawn();
    try {
      expect(() =>
        child.start({
          direction: "upload",
          endpoint: { host: "127.0.0.1", port: 1, token: "0".repeat(64) },
          size: 0,
        }),
      ).toThrow("wrong direction");
      assert.equal(owner.stats().children, 1);
    } finally {
      await owner.close();
    }
    await child.exited;
    assert.equal(owner.stats().children, 0);
  });
  it.each(["direction", "phase", "count", "digest"] as const)(
    "fences malformed read-process %s metadata and still joins its process",
    async (fault) => {
      const directory = await mkdtemp(join(tmpdir(), "network-read-protocol-"));
      directories.push(directory);
      const path = join(directory, "misbehaving-peer.ts");
      const messages = {
        direction: { kind: "credit-held" },
        phase: { kind: "consumed", sizeBytes: 0, sha256: "0".repeat(64) },
        count: { kind: "chunk-held", sizeBytes: 1, sha256: "0".repeat(64) },
        digest: { kind: "chunk-held", sizeBytes: 0, sha256: "1".repeat(64) },
      };
      const message = messages[fault];
      const expected = {
        direction: /wrong direction/,
        phase: /wrong direction or phase/,
        count: /unexpected byte count/,
        digest: /digest mismatch/,
      }[fault];
      // Deliberately mocked process protocol only; no native or transport behavior is claimed here.
      await writeFile(
        path,
        `process.on("message", () => { process.send({ kind: "runtime", pid: process.pid, executable: process.execPath, sidecarUrl: import.meta.url }); process.send({ ...${JSON.stringify(message)}, pid: process.pid }); });`,
      );
      const owner = new NetworkProcessOwner(
        process.execPath,
        pathToFileURL(path),
        "read",
      );
      const child = owner.spawn();
      child.start({
        direction: "read",
        endpoint: {
          direction: "read",
          host: "127.0.0.1",
          port: 1,
          token: "0".repeat(64),
        },
        facts: { sizeBytes: 0, sha256: "0".repeat(64) },
      });
      try {
        await assert.rejects(child.result, expected);
        await assert.rejects(child.held, expected);
        expect(owner.stats().fenced).toBe(true);
        assert.throws(() => owner.spawn(), /fenced/);
      } finally {
        await assert.rejects(owner.close(), expected);
      }
      await child.exited;
      assert.equal(owner.stats().children, 0);
    },
  );
  it.each(["bridge", "consumer", "runtime"])(
    "cleans up a missing read %s without changing the stored BLOB",
    async (artifact) => {
      const directory = await mkdtemp(join(tmpdir(), "network-read-artifact-"));
      directories.push(directory);
      const missing = join(directory, `missing-${artifact}`);
      const options: NetworkReadSidecars = {
        readBridgeUrl,
        readConsumerUrl,
        bunExecutable: process.execPath,
      };
      if (artifact === "bridge") options.readBridgeUrl = pathToFileURL(missing);
      if (artifact === "consumer")
        options.readConsumerUrl = pathToFileURL(missing);
      if (artifact === "runtime") options.bunExecutable = missing;
      const database = join(directory, "native-owner.db");
      const error = await exerciseNetworkReadArtifactFailure(
        pathToFileURL(database).href,
        workerUrl,
        options,
      );
      expect(error.nodes.some((node) => node.message.includes(missing))).toBe(
        true,
      );
      assert.equal(await Bun.file(database).exists(), true);
    },
  );
  it.each(["bridge", "producer", "runtime"])(
    "cleans up a missing %s without publication or replacing the healthy native owner",
    async (artifact) => {
      const directory = await mkdtemp(join(tmpdir(), "network-artifact-"));
      directories.push(directory);
      const missing = join(directory, `missing-${artifact}`);
      const options: NetworkSidecars = {
        bridgeUrl,
        producerUrl,
        bunExecutable: process.execPath,
      };
      if (artifact === "bridge") options.bridgeUrl = pathToFileURL(missing);
      if (artifact === "producer") options.producerUrl = pathToFileURL(missing);
      if (artifact === "runtime") options.bunExecutable = missing;
      const database = join(directory, "native-owner.db");
      const error = await exerciseNetworkArtifactFailure(
        pathToFileURL(database).href,
        workerUrl,
        options,
      );
      expect(error.nodes.some((node) => node.message.includes(missing))).toBe(
        true,
      );
      // Unlike missing native startup, this failure occurs AFTER a real DB/stage
      // exists. The helper checks SQL usability, empty tables and released credit.
      assert.equal(await Bun.file(database).exists(), true);
    },
  );
  it("requires explicit local artifacts and never searches PATH for a producer runtime", () => {
    expect(() => new NetworkProcessOwner("bun", producerUrl, "upload")).toThrow(
      "absolute Bun executable",
    );
    assert.throws(
      () =>
        new NetworkProcessOwner(
          process.execPath,
          new URL("https://example.invalid/producer.js"),
          "upload",
        ),
      /local sidecar/,
    );
    assert.throws(
      () =>
        new NetworkProcessOwner(
          process.execPath,
          new URL(`${producerUrl.href}?fallback=1`),
          "upload",
        ),
      /local sidecar/,
    );
  });
  it.each(["upload", "read"] as const)(
    "bounds %s child admission and joins already-started processes on close",
    async (direction) => {
      const owner = new NetworkProcessOwner(
        process.execPath,
        direction === "upload" ? producerUrl : readConsumerUrl,
        direction,
      );
      const first = owner.spawn();
      const second = owner.spawn();
      try {
        assert.notEqual(first.pid, process.pid);
        assert.notEqual(first.pid, second.pid);
        assert.throws(() => owner.spawn(), /capacity exceeded/);
        expect(owner.stats().children).toBe(2);
      } finally {
        await owner.close();
      }
      assert.equal(owner.stats().children, 0);
      await Promise.all([first.exited, second.exited]);
      assert.throws(() => owner.spawn(), /fenced/);
    },
  );
  it.each(["upload", "read"] as const)(
    "retains a failed %s termination until actual exit and never retries its cached close",
    async (direction) => {
      class FailedTermination extends NetworkProcessOwner {
        public requests = 0;
        protected override requestTermination(): void {
          this.requests++;
          throw new Error("Injected child termination failure");
        }
      }
      const owner = new FailedTermination(
        process.execPath,
        direction === "upload" ? producerUrl : readConsumerUrl,
        direction,
      );
      const child = owner.spawn();
      try {
        const closing = owner.close();
        await assert.rejects(closing, (error: unknown) => {
          assert(error instanceof AggregateError);
          assert(error.cause instanceof Error);
          assert.match(error.cause.message, /termination failure/);
          return true;
        });
        assert.equal(owner.close(), closing);
        expect(owner.stats()).toEqual({ children: 1, fenced: true });
        assert.equal(owner.requests, 1);
        assert.throws(() => owner.spawn(), /fenced/);
      } finally {
        // Explicit recovery of this test-owned process; no implicit retry/respawn.
        process.kill(child.pid, "SIGTERM");
        await child.exited;
      }
      assert.equal(owner.stats().children, 0);
      await assert.rejects(owner.close());
      assert.equal(owner.requests, 1);
    },
  );
});
