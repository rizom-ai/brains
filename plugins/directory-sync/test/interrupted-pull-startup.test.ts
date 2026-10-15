import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { DirectorySyncPlugin } from "../src/plugin";
import { BrokerConnection } from "../src/lib/broker/client";
import { startGitBrokerHost } from "../src/lib/broker/host";
import { gitBrokerSocketPath } from "../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../src/lib/git-options";
import type { DirectorySyncConfigInput } from "../src/types";
import { runGit } from "./git/real-git";

/**
 * A pull that a previous process left in flight is recovered by whichever
 * startup step reconciles the checkout first. Each outcome is recorded once,
 * as a terminal run, so the interrupted pull never lingers as "pulling".
 */

const INTERRUPTED_RUN_ID = "interrupted-run";
const RECOVERY_FAILED = "Interrupted Git handoff recovery failed: ";

const storedStatusSchema = z.looseObject({
  activeRun: z.looseObject({ id: z.string(), state: z.string() }).optional(),
  recentRuns: z.array(
    z.looseObject({
      id: z.string(),
      outcome: z.string(),
      summary: z.string(),
    }),
  ),
  issues: z.array(z.looseObject({ kind: z.string(), message: z.string() })),
});

type StoredStatus = z.output<typeof storedStatusSchema>;
type Harness = ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;

interface Owner {
  stop(): Promise<void>;
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(async () => rmSync(path, { recursive: true, force: true }));
  return path;
}

function statusStore(harness: Harness): {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
} {
  return harness.getMockShell().getRuntimeState().scoped<unknown>({
    namespace: "directory-sync.operation-status",
    schema: z.unknown(),
  });
}

async function seedInterruptedPull(harness: Harness): Promise<void> {
  await statusStore(harness).set("current", {
    activeRun: {
      id: INTERRUPTED_RUN_ID,
      source: "periodic",
      state: "pulling",
      startedAt: "2025-01-01T00:00:00.000Z",
      lastProgressAt: "2025-01-01T00:00:01.000Z",
      imported: 0,
      skipped: 0,
      failed: 0,
      quarantined: 0,
      exported: 0,
    },
    recentRuns: [],
    issues: [],
  });
}

/** A checkpoint record that fails its schema, so reading it throws. */
async function corruptReconciliationCheckpoint(
  harness: Harness,
): Promise<void> {
  await harness
    .getMockShell()
    .getRuntimeState()
    .scoped<unknown>({
      namespace: "directory-sync.git-reconciliation",
      schema: z.unknown(),
    })
    .set("current", { checkpoint: "not a checkpoint" });
}

async function readStatus(harness: Harness): Promise<StoredStatus> {
  return storedStatusSchema.parse(await statusStore(harness).get("current"));
}

/** The interrupted run, closed as a failed recovery that names its cause. */
function expectFailedRecovery(status: StoredStatus, cause?: string): void {
  expect(status.activeRun).toBeUndefined();
  const [run] = status.recentRuns;
  expect(run?.id).toBe(INTERRUPTED_RUN_ID);
  expect(run?.outcome).toBe("failed");
  expect(run?.summary).toStartWith(RECOVERY_FAILED);
  if (cause !== undefined) expect(run?.summary).toContain(cause);
  const [issue] = status.issues;
  expect(issue?.kind).toBe("git");
  expect(issue?.message).toStartWith(RECOVERY_FAILED);
}

/** The interrupted run, closed as recovered. */
function expectRecovered(status: StoredStatus, summary: string): void {
  expect(status.activeRun).toBeUndefined();
  expect(status.recentRuns[0]).toMatchObject({
    id: INTERRUPTED_RUN_ID,
    outcome: "attention",
    summary,
  });
}

interface GitFixture {
  checkout: string;
  socketPath: string;
  config: DirectorySyncConfigInput;
}

/**
 * A checkout owned by a running broker, with a remote that may not exist.
 * With `inheritedWork`, the owner replaces one that held the checkout, so it
 * starts with mutations closed until the serving role reconciles.
 */
async function startOwnedCheckout(options: {
  remote: "bare" | "missing";
  initialSync: boolean;
  inheritedWork?: boolean;
}): Promise<GitFixture> {
  const root = tempDir("test-interrupted-pull-git-");
  const checkout = join(root, "checkout");
  const socketPath = gitBrokerSocketPath(join(root, "runtime"));
  const remotePath = join(root, "remote.git");
  if (options.remote === "bare") {
    mkdirSync(remotePath, { recursive: true });
    await runGit(["init", "--bare", "--initial-branch=main"], remotePath);
  }
  const config: DirectorySyncConfigInput = {
    syncPath: checkout,
    autoSync: false,
    initialSync: options.initialSync,
    seedContent: false,
    git: {
      gitUrl: `file://${remotePath}`,
      branch: "main",
      authorName: "Test",
      authorEmail: "test@example.com",
      bootstrapFromSeed: false,
    },
  };
  const startOwner = (): Promise<Owner> =>
    startGitBrokerHost({
      socketPath,
      cwd: root,
      dataDir: checkout,
      pluginConfig: config,
      logger: createSilentLogger(),
    });
  if (options.inheritedWork) {
    const previous = await startOwner();
    const connection = await BrokerConnection.connect(socketPath);
    await connection.registerCheckout({
      checkoutPath: checkout,
      branch: "main",
      remoteFingerprint: getGitRemoteFingerprint(`file://${remotePath}`),
    });
    await connection.execute(checkout, { name: "initialize" });
    connection.close();
    await previous.stop();
  }
  const owner = await startOwner();
  cleanups.push(() => owner.stop());
  return { checkout, socketPath, config };
}

function createHarness(options: {
  dataDir: string;
  gitBrokerSocket?: string;
  gitBrokerCheckout?: string;
}): Harness {
  const harness = createPluginHarness<DirectorySyncPlugin>(options);
  cleanups.push(() => harness.reset());
  return harness;
}

describe("interrupted pull recovery at startup", () => {
  it("records a failed recovery when the Git broker cannot be reached", async () => {
    const checkout = tempDir("test-interrupted-pull-no-broker-");
    const harness = createHarness({
      dataDir: checkout,
      gitBrokerCheckout: checkout,
    });
    await seedInterruptedPull(harness);
    const plugin = new DirectorySyncPlugin({
      syncPath: checkout,
      autoSync: false,
      initialSync: false,
      git: {
        gitUrl: `file://${join(checkout, "missing-remote.git")}`,
        branch: "main",
        authorName: "Test",
        authorEmail: "test@example.com",
        bootstrapFromSeed: false,
      },
    });

    expect(harness.installPlugin(plugin)).rejects.toThrow(
      "BRAIN_GIT_BROKER_SOCKET is unset",
    );

    expectFailedRecovery(
      await readStatus(harness),
      "BRAIN_GIT_BROKER_SOCKET is unset",
    );
  });

  it("records the recovery once the startup replay has queued the checkout", async () => {
    const fixture = await startOwnedCheckout({
      remote: "missing",
      initialSync: false,
    });
    const harness = createHarness({
      dataDir: fixture.checkout,
      gitBrokerSocket: fixture.socketPath,
      gitBrokerCheckout: fixture.checkout,
    });
    await seedInterruptedPull(harness);
    const plugin = new DirectorySyncPlugin(fixture.config);
    cleanups.push(() => plugin.shutdown());

    await harness.installPlugin(plugin);

    expectRecovered(
      await readStatus(harness),
      "Recovered interrupted Git handoff during startup",
    );
  }, 60_000);

  it("records a failed recovery when the startup replay throws", async () => {
    const fixture = await startOwnedCheckout({
      remote: "missing",
      initialSync: false,
    });
    const harness = createHarness({
      dataDir: fixture.checkout,
      gitBrokerSocket: fixture.socketPath,
      gitBrokerCheckout: fixture.checkout,
    });
    await seedInterruptedPull(harness);
    await corruptReconciliationCheckpoint(harness);
    const plugin = new DirectorySyncPlugin(fixture.config);
    cleanups.push(() => plugin.shutdown());

    expect(harness.installPlugin(plugin)).rejects.toThrow();

    expectFailedRecovery(await readStatus(harness), "checkpoint");
  }, 60_000);

  // Initial sync is on in the next two, so registration runs no startup
  // replay: the only step left to fail is the one each test breaks.
  it("records a failed recovery when inherited-work reconciliation throws", async () => {
    const fixture = await startOwnedCheckout({
      remote: "missing",
      initialSync: true,
      inheritedWork: true,
    });
    const harness = createHarness({
      dataDir: fixture.checkout,
      gitBrokerSocket: fixture.socketPath,
      gitBrokerCheckout: fixture.checkout,
    });
    await seedInterruptedPull(harness);
    await corruptReconciliationCheckpoint(harness);
    const plugin = new DirectorySyncPlugin(fixture.config);
    cleanups.push(() => plugin.shutdown());

    expect(harness.installPlugin(plugin)).rejects.toThrow("checkpoint");

    expectFailedRecovery(await readStatus(harness), "checkpoint");
  }, 60_000);

  it("records a failed recovery when Git initialization throws", async () => {
    const fixture = await startOwnedCheckout({
      remote: "missing",
      initialSync: true,
    });
    // A `.git` file where a repository should be: initialization cannot
    // read the checkout it is asked to prepare.
    mkdirSync(fixture.checkout, { recursive: true });
    writeFileSync(join(fixture.checkout, ".git"), "not a gitdir\n");
    const harness = createHarness({
      dataDir: fixture.checkout,
      gitBrokerSocket: fixture.socketPath,
      gitBrokerCheckout: fixture.checkout,
    });
    await seedInterruptedPull(harness);
    const plugin = new DirectorySyncPlugin(fixture.config);
    cleanups.push(() => plugin.shutdown());

    expect(harness.installPlugin(plugin)).rejects.toThrow("ENOTDIR");

    expectFailedRecovery(await readStatus(harness), "ENOTDIR");
  }, 60_000);

  it("records the recovery once the initial sync has pulled", async () => {
    const fixture = await startOwnedCheckout({
      remote: "bare",
      initialSync: true,
    });
    const harness = createHarness({
      dataDir: fixture.checkout,
      gitBrokerSocket: fixture.socketPath,
      gitBrokerCheckout: fixture.checkout,
    });
    await seedInterruptedPull(harness);
    const plugin = new DirectorySyncPlugin(fixture.config);
    cleanups.push(() => plugin.shutdown());

    await harness.installPlugin(plugin);
    // Registration leaves the interrupted pull for initial sync to settle.
    expect((await readStatus(harness)).activeRun?.id).toBe(INTERRUPTED_RUN_ID);

    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {}, "test");

    expectRecovered(
      await readStatus(harness),
      "Recovered interrupted Git handoff during initial sync",
    );
  }, 60_000);

  it("records a failed recovery when the initial sync pull fails", async () => {
    const fixture = await startOwnedCheckout({
      remote: "missing",
      initialSync: true,
    });
    const harness = createHarness({
      dataDir: fixture.checkout,
      gitBrokerSocket: fixture.socketPath,
      gitBrokerCheckout: fixture.checkout,
    });
    await seedInterruptedPull(harness);
    const plugin = new DirectorySyncPlugin(fixture.config);
    cleanups.push(() => plugin.shutdown());

    await harness.installPlugin(plugin);
    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {}, "test");

    expectFailedRecovery(await readStatus(harness), "Failed to pull");
  }, 60_000);

  it("leaves the interrupted pull to the serving role in an execution-only process", async () => {
    const path = tempDir("test-interrupted-pull-worker-");
    const harness = createHarness({ dataDir: path });
    await seedInterruptedPull(harness);
    const plugin = new DirectorySyncPlugin({
      syncPath: path,
      autoSync: false,
      initialSync: false,
    });
    cleanups.push(() => plugin.shutdown());

    await plugin.register(harness.getMockShell(), { executionOnly: true });

    const status = await readStatus(harness);
    expect(status.activeRun).toMatchObject({
      id: INTERRUPTED_RUN_ID,
      state: "pulling",
    });
    expect(status.recentRuns).toEqual([]);
  });
});
