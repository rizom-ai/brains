import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { startGitBrokerHost } from "../../../src/lib/broker/host";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";
import type { GitBrokerServer } from "../../../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";

/**
 * Phase 3 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * The broker child owns one checkout and learns which one from the same
 * `brain.yaml` its app roles read. It resolves the remote — and any token —
 * from its own configuration, so nothing a client sends can widen what this
 * process owns.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

interface Harness {
  socketPath: string;
  cwd: string;
  dataDir: string;
  gitUrl: string;
}

async function harness(): Promise<Harness> {
  scratch = await mkdtemp(join(tmpdir(), "broker-host-"));
  return {
    socketPath: gitBrokerSocketPath(join(scratch, "runtime")),
    cwd: scratch,
    dataDir: join(scratch, "brain-data"),
    gitUrl: `file://${join(scratch, "remote.git")}`,
  };
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("git broker host", () => {
  it("owns exactly the checkout its configuration names", async () => {
    const { socketPath, cwd, dataDir, gitUrl } = await harness();
    broker = await startGitBrokerHost({
      socketPath,
      cwd,
      dataDir,
      logger: createSilentLogger(),
      pluginConfig: { git: { gitUrl, branch: "main" } },
    });

    expect(broker.socketPath).toBe(socketPath);

    const connection = await BrokerConnection.connect(socketPath);
    const identity = {
      branch: "main",
      remoteFingerprint: getGitRemoteFingerprint(gitUrl),
    };

    const status = await connection.registerCheckout({
      checkoutPath: dataDir,
      ...identity,
    });
    expect(status.checkouts).toEqual([dataDir]);

    // A client naming a different path must not be able to make this broker
    // the owner of a checkout its configuration never mentioned.
    const rejected = await connection
      .registerCheckout({
        checkoutPath: join(cwd, "somewhere-else"),
        ...identity,
      })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );
    expect(rejected).toContain("owns no checkout");

    connection.close();
  }, 30_000);

  it("prefers a configured syncPath over the Brain data dir", async () => {
    const { socketPath, cwd, dataDir, gitUrl } = await harness();
    const syncPath = join(cwd, "content");
    broker = await startGitBrokerHost({
      socketPath,
      cwd,
      dataDir,
      logger: createSilentLogger(),
      pluginConfig: { syncPath, git: { gitUrl } },
    });

    const connection = await BrokerConnection.connect(socketPath);
    const identity = {
      branch: "main",
      remoteFingerprint: getGitRemoteFingerprint(gitUrl),
    };

    const status = await connection.registerCheckout({
      checkoutPath: syncPath,
      ...identity,
    });
    expect(status.checkouts).toEqual([syncPath]);

    const rejected = await connection
      .registerCheckout({ checkoutPath: dataDir, ...identity })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );
    expect(rejected).toContain("owns no checkout");

    connection.close();
  }, 30_000);

  it("refuses to start for a Brain without Git", async () => {
    const { socketPath, cwd, dataDir } = await harness();

    // The supervisor should never get here — a Brain without Git starts no
    // broker at all — but an owner with nothing to own is a configuration
    // error, not something to run and let clients discover.
    const outcome = await startGitBrokerHost({
      socketPath,
      cwd,
      dataDir,
      logger: createSilentLogger(),
      pluginConfig: { git: { branch: "main" } },
    }).then(
      () => undefined,
      (error: unknown) => String(error),
    );

    expect(outcome).toContain("no Git remote");
  }, 30_000);
});
