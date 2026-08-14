import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "@brains/utils/hash";
import { BrokerJournal } from "../../../src/lib/broker/journal";
import { GitExecutor } from "../../../src/lib/broker/executor";
import { BROKER_PROTOCOL_VERSION } from "../../../src/lib/broker/protocol";
import type { ExecuteMessage } from "../../../src/lib/broker/protocol";

/**
 * Phase 6 of docs/plans/directory-sync-git-execution-broker.md — the crash
 * points that belong to the broker: lock acquired, Git started, Git exited
 * before the result was written, and the result written before it was
 * acknowledged. The handoff points downstream of Git live with the
 * reconciliation checkpoint and are covered in reconciliation-checkpoint.test.
 */

const LINUX = process.platform === "linux";
const REPOSITORY_KEY = "brain-data";

let scratch: string | undefined;

interface Harness {
  runtimeDir: string;
  checkout: string;
  journal: BrokerJournal;
}

async function git(args: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "ignore",
    stderr: "pipe",
  });
  if ((await child.exited) !== 0) {
    throw new Error(
      `git ${args.join(" ")}: ${await new Response(child.stderr).text()}`,
    );
  }
}

async function harness(): Promise<Harness> {
  scratch = await mkdtemp(join(tmpdir(), "broker-recovery-"));
  const checkout = join(scratch, "checkout");
  const runtimeDir = join(scratch, "runtime");
  await mkdir(checkout, { recursive: true });
  await git(["init", "--initial-branch=main"], checkout);
  await git(["config", "user.email", "test@example.com"], checkout);
  await git(["config", "user.name", "Test"], checkout);
  await writeFile(join(checkout, "seed.md"), "seed\n");
  await git(["add", "."], checkout);
  await git(["commit", "-m", "seed"], checkout);

  return {
    runtimeDir,
    checkout,
    journal: await BrokerJournal.open(join(runtimeDir, "journal")),
  };
}

/** A fresh executor over the same journal — the replacement after a crash. */
async function executorFor(harness: Harness): Promise<GitExecutor> {
  const executor = await GitExecutor.create({
    runtimeDir: harness.runtimeDir,
    observeIntervalMs: 10,
  });
  executor.register({
    type: "register-checkout",
    version: BROKER_PROTOCOL_VERSION,
    repositoryKey: REPOSITORY_KEY,
    checkoutPath: harness.checkout,
    branch: "main",
    remoteFingerprint: sha256Hex("https://example.com/repo.git"),
    timeoutMs: 30_000,
    maxOutputBytes: 1024 * 1024,
  });
  return executor;
}

function request(overrides: Partial<ExecuteMessage> = {}): ExecuteMessage {
  return {
    type: "execute",
    version: BROKER_PROTOCOL_VERSION,
    requestId: "req_recovery00001",
    repositoryKey: REPOSITORY_KEY,
    operationClass: "mutate",
    args: ["commit", "--allow-empty", "-m", "recovered"],
    ...overrides,
  };
}

/** A pid that cannot exist: pid_max itself is never allocated. */
async function deadPid(): Promise<number> {
  const max = await readFile("/proc/sys/kernel/pid_max", "utf-8").catch(
    () => "4194304",
  );
  return Number(max.trim());
}

async function countCommits(checkout: string): Promise<number> {
  const child = Bun.spawn(["git", "log", "--format=%H"], {
    cwd: checkout,
    stdout: "pipe",
    stderr: "ignore",
  });
  const out = await new Response(child.stdout).text();
  await child.exited;
  return out.trim().split("\n").filter(Boolean).length;
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("broker crash recovery", () => {
  it("retires a request whose wrapper died before writing a result", async () => {
    const h = await harness();
    // Git started under a wrapper that then died: an active record with no
    // terminal record and no live wrapper.
    await h.journal.writeActive({
      requestId: "req_abandoned0001",
      repositoryKey: REPOSITORY_KEY,
      operationClass: "mutate",
      args: ["commit", "-m", "interrupted"],
      startedAt: "2026-08-14T07:00:00.000Z",
      stdoutBytes: 0,
      stderrBytes: 0,
      wrapperPid: null,
    });
    await writeFile(
      join(h.runtimeDir, "journal", "wrapper-req_abandoned0001.active"),
      [
        "request_id=req_abandoned0001",
        `wrapper_pid=${await deadPid()}`,
        "git_pgid=0",
        "phase=running",
        "started_at=2026-08-14T07:00:00.000Z",
        "observed_at=2026-08-14T07:00:00.000Z",
        "stdout_bytes=0",
        "stderr_bytes=0",
      ].join("\n"),
    );

    const executor = await executorFor(h);
    const report = await executor.reconcile();

    expect(report.abandoned).toEqual(["req_abandoned0001"]);
    expect(report.owned).toEqual([]);
    // The outcome is genuinely unknown, so the record is kept as evidence
    // rather than deleted — but it no longer blocks the checkout.
    expect(await h.journal.readActive("req_abandoned0001")).toBeNull();
    expect(await readdir(join(h.runtimeDir, "journal", "abandoned"))).toEqual([
      "active-req_abandoned0001.json",
    ]);
    expect(executor.status().activeRequestIds).toEqual([]);
  }, 60_000);

  it("keeps a request whose wrapper is still alive", async () => {
    const h = await harness();
    await h.journal.writeActive({
      requestId: "req_stillalive001",
      repositoryKey: REPOSITORY_KEY,
      operationClass: "mutate",
      args: ["commit", "-m", "in flight"],
      startedAt: "2026-08-14T07:00:00.000Z",
      stdoutBytes: 0,
      stderrBytes: 0,
      wrapperPid: null,
    });
    await writeFile(
      join(h.runtimeDir, "journal", "wrapper-req_stillalive001.active"),
      [
        "request_id=req_stillalive001",
        // This test process stands in for a wrapper that outlived its broker.
        `wrapper_pid=${process.pid}`,
        "git_pgid=0",
        "phase=running",
        "started_at=2026-08-14T07:00:00.000Z",
        "observed_at=2026-08-14T07:00:00.000Z",
        "stdout_bytes=0",
        "stderr_bytes=0",
      ].join("\n"),
    );

    const executor = await executorFor(h);
    const report = await executor.reconcile();

    // Its advisory lock is still held and it will reach a terminal result on
    // its own; a replacement must not touch it.
    expect(report.owned).toEqual(["req_stillalive001"]);
    expect(report.abandoned).toEqual([]);
    expect(await h.journal.readActive("req_stillalive001")).not.toBeNull();
    expect(executor.status().activeRequestIds).toEqual(["req_stillalive001"]);
  }, 60_000);

  it("clears a request whose result landed but was never acknowledged", async () => {
    const h = await harness();
    const executor = await executorFor(h);

    // The command completes; the caller never sees the acknowledgement.
    await executor.execute(request());
    // Its active record is cleared on the happy path, so re-create the state a
    // crash between terminal write and clear would leave behind.
    await h.journal.writeActive({
      requestId: "req_recovery00001",
      repositoryKey: REPOSITORY_KEY,
      operationClass: "mutate",
      args: ["commit", "--allow-empty", "-m", "recovered"],
      startedAt: "2026-08-14T07:00:00.000Z",
      stdoutBytes: 0,
      stderrBytes: 0,
      wrapperPid: null,
    });

    const report = await (await executorFor(h)).reconcile();

    expect(report.completed).toEqual(["req_recovery00001"]);
    expect(report.abandoned).toEqual([]);
    expect(await h.journal.readActive("req_recovery00001")).toBeNull();
  }, 60_000);

  it("never repeats a mutation when a replacement replays the request id", async () => {
    const h = await harness();
    const before = await countCommits(h.checkout);

    const first = await (await executorFor(h)).execute(request());
    const afterFirst = await countCommits(h.checkout);

    // The acknowledgement was lost and a replacement broker sees the retry.
    const replayed = await (await executorFor(h)).execute(request());
    const afterReplay = await countCommits(h.checkout);

    expect(afterFirst).toBe(before + 1);
    expect(afterReplay).toBe(afterFirst);
    expect(replayed.stdout).toBe(first.stdout);
    expect(replayed.completedAt).toBe(first.completedAt);
  }, 60_000);

  it("quarantines an unreadable record instead of trusting it", async () => {
    const h = await harness();
    await h.journal.writeActive({
      requestId: "req_corrupted0001",
      repositoryKey: REPOSITORY_KEY,
      operationClass: "mutate",
      args: ["commit", "-m", "x"],
      startedAt: "2026-08-14T07:00:00.000Z",
      stdoutBytes: 0,
      stderrBytes: 0,
      wrapperPid: null,
    });
    await writeFile(
      join(h.runtimeDir, "journal", "active-req_corrupted0001.json"),
      '{"requestId":"req_cor',
    );

    const report = await (await executorFor(h)).reconcile();

    expect(report.quarantined).toEqual(["active-req_corrupted0001.json"]);
    expect(report.abandoned).toEqual([]);
  }, 60_000);

  it("reconciles before it starts listening", async () => {
    const h = await harness();
    await h.journal.writeActive({
      requestId: "req_priorlife0001",
      repositoryKey: REPOSITORY_KEY,
      operationClass: "mutate",
      args: ["commit", "-m", "interrupted"],
      startedAt: "2026-08-14T07:00:00.000Z",
      stdoutBytes: 0,
      stderrBytes: 0,
      wrapperPid: null,
    });

    const { GitBrokerServer } = await import("../../../src/lib/broker/server");
    const broker = await GitBrokerServer.start({
      runtimeDir: h.runtimeDir,
      observeIntervalMs: 10,
    });

    try {
      // A client must never reach an executor that still believes a dead
      // wrapper owns its checkout.
      expect(broker.reconciliation.abandoned).toEqual(["req_priorlife0001"]);
      expect(broker.executor.status().activeRequestIds).toEqual([]);
    } finally {
      await broker.stop();
    }
  }, 60_000);

  it("lets a fresh request proceed after an abandoned one is retired", async () => {
    const h = await harness();
    await h.journal.writeActive({
      requestId: "req_abandoned0002",
      repositoryKey: REPOSITORY_KEY,
      operationClass: "mutate",
      args: ["commit", "-m", "interrupted"],
      startedAt: "2026-08-14T07:00:00.000Z",
      stdoutBytes: 0,
      stderrBytes: 0,
      wrapperPid: null,
    });

    const executor = await executorFor(h);
    await executor.reconcile();

    const before = await countCommits(h.checkout);
    await executor.execute(request({ requestId: "req_afterabandon1" }));

    // A retry is a fresh request with a fresh id; the retired one neither
    // replays nor blocks the checkout.
    expect(await countCommits(h.checkout)).toBe(before + 1);
  }, 60_000);
});
