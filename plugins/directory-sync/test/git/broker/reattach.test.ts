import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { connectGitSync } from "../../../src/lib/broker/connect";
import { startGitBrokerHost } from "../../../src/lib/broker/host";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";
import type { GitBrokerServer } from "../../../src/lib/broker/server";
import { commitTouching } from "../real-git";

/**
 * Phase 3 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * A proven-safe broker replacement leaves web and worker running, so those
 * roles have to reattach to the new owner. What they must not do is decide for
 * themselves that an interrupted mutation never happened: an acknowledgement
 * lost to a replaced broker is ambiguous, and re-running it from intent is how
 * one commit becomes two.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

interface Owned {
  socketPath: string;
  checkoutPath: string;
  gitUrl: string;
  /** Replace the owner, as a supervisor would after proving the group gone. */
  restart(): Promise<void>;
}

async function ownedCheckout(): Promise<Owned> {
  scratch = await mkdtemp(join(tmpdir(), "broker-reattach-"));
  const socketPath = gitBrokerSocketPath(join(scratch, "runtime"));
  const checkoutPath = join(scratch, "brain-data");
  const gitUrl = `file://${join(scratch, "remote.git")}`;
  const start = async (): Promise<void> => {
    broker = await startGitBrokerHost({
      socketPath,
      cwd: scratch ?? "",
      dataDir: checkoutPath,
      logger: createSilentLogger(),
      pluginConfig: { git: { gitUrl, branch: "main" } },
    });
  };

  await start();
  return {
    socketPath,
    checkoutPath,
    gitUrl,
    restart: async (): Promise<void> => {
      await broker?.stop();
      broker = undefined;
      await start();
    },
  };
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("reattaching to a replacement owner", () => {
  it("registers with the new owner and keeps working", async () => {
    const owned = await ownedCheckout();
    const gitSync = await connectGitSync({
      socketPath: owned.socketPath,
      checkoutPath: owned.checkoutPath,
      branch: "main",
      remoteUrl: owned.gitUrl,
      logger: createSilentLogger(),
    });
    await gitSync.initialize();

    await owned.restart();

    // Reads are safe to replay, so the caller should not have to know the
    // owner changed underneath it.
    const status = await gitSync.getStatus();
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe("main");

    await gitSync.cleanup();
  }, 60_000);

  it("reports that the owner changed, exactly once per replacement", async () => {
    const owned = await ownedCheckout();
    const replacements: string[] = [];
    const gitSync = await connectGitSync({
      socketPath: owned.socketPath,
      checkoutPath: owned.checkoutPath,
      branch: "main",
      remoteUrl: owned.gitUrl,
      logger: createSilentLogger(),
      onOwnerReplaced: (brokerId) => {
        replacements.push(brokerId);
      },
    });
    await gitSync.initialize();
    expect(replacements).toEqual([]);

    await owned.restart();

    // Whatever the old owner was in the middle of is ambiguous now, and only
    // the repository can settle it. The caller has to be told, or a mutation
    // that landed without an acknowledgement is never reconciled.
    await gitSync.getStatus();
    expect(replacements).toHaveLength(1);

    // Still the same owner: reattaching is not by itself a replacement.
    await gitSync.getStatus();
    await gitSync.hasLocalChanges();
    expect(replacements).toHaveLength(1);

    await gitSync.cleanup();
  }, 60_000);

  it("refuses to re-run a mutation the old owner may have finished", async () => {
    const owned = await ownedCheckout();
    const gitSync = await connectGitSync({
      socketPath: owned.socketPath,
      checkoutPath: owned.checkoutPath,
      branch: "main",
      remoteUrl: owned.gitUrl,
      logger: createSilentLogger(),
    });
    await gitSync.initialize();
    await writeFile(join(owned.checkoutPath, "first.md"), "first\n");
    await gitSync.commit("first change");

    await owned.restart();
    await writeFile(join(owned.checkoutPath, "second.md"), "second\n");

    // The first attempt is lost with the old connection. Whether that commit
    // landed is unknowable from here, so it is reported rather than retried.
    const interrupted = await gitSync.commit("second change").then(
      () => undefined,
      (error: unknown) => String(error),
    );
    expect(interrupted).toContain("unavailable");

    // Only one commit exists for the file, whatever the caller does next.
    await gitSync.commit("second change");
    expect(await commitTouching(owned.checkoutPath, "second.md")).toEqual([
      "second.md",
    ]);

    await gitSync.cleanup();
  }, 60_000);
});
