import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { sha256Hex } from "@brains/utils/hash";
import { BrokerConnection } from "../../../src/lib/broker/client";
import {
  BrokerStartupError,
  GitBrokerServer,
} from "../../../src/lib/broker/server";
import { pathExists } from "../../../src/lib/fs-utils";

/**
 * Phase 2, end to end over a real Unix socket.
 *
 * Two independent connections stand in for web and worker. The interleaving
 * scenario is the same one `test/git/operation-atomicity.test.ts` uses to
 * reproduce the defect, so this is a direct before/after across a process
 * boundary rather than a differently shaped claim.
 */

const LINUX = process.platform === "linux";
const FINGERPRINT = sha256Hex("");

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

async function git(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(" ")}: ${err}`);
  return out;
}

async function commitTouching(
  checkout: string,
  path: string,
): Promise<string[]> {
  const sha = (
    await git(["log", "--format=%H", "-1", "--", path], checkout)
  ).trim();
  if (!sha) return [];
  return (await git(["show", "--name-only", "--format=", sha], checkout))
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
}

async function untilExists(path: string, budgetMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  const poll = async (): Promise<boolean> => {
    if (await pathExists(path)) return true;
    if (Date.now() >= deadline) return false;
    await Bun.sleep(10);
    return poll();
  };
  return poll();
}

interface Harness {
  socketPath: string;
  checkout: string;
  runtimeDir: string;
}

async function startBroker(): Promise<Harness> {
  scratch = await mkdtemp(join(tmpdir(), "broker-server-"));
  const checkout = join(scratch, "checkout");
  const runtimeDir = join(scratch, "runtime");

  broker = await GitBrokerServer.start({
    runtimeDir,
    resolveCheckout: (checkoutPath) =>
      checkoutPath === checkout
        ? {
            logger: createSilentLogger(),
            dataDir: checkout,
            branch: "main",
            remoteUrl: "",
            authenticatedUrl: "",
            remoteFingerprint: FINGERPRINT,
            timeoutMs: 30_000,
            authorName: "Test",
            authorEmail: "test@example.com",
          }
        : undefined,
  });

  return { socketPath: broker.socketPath, checkout, runtimeDir };
}

async function connect(harness: Harness): Promise<BrokerConnection> {
  const connection = await BrokerConnection.connect(harness.socketPath);
  await connection.registerCheckout({
    checkoutPath: harness.checkout,
    branch: "main",
    remoteFingerprint: FINGERPRINT,
  });
  return connection;
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("git broker server", () => {
  it("runs operations for a registered checkout", async () => {
    const harness = await startBroker();
    const client = await connect(harness);

    await client.execute(harness.checkout, { name: "initialize" });
    await writeFile(join(harness.checkout, "note.md"), "hello\n");
    expect(
      await client.execute(harness.checkout, { name: "has-local-changes" }),
    ).toBe(true);

    await client.execute(harness.checkout, {
      name: "commit",
      message: "add note",
    });
    const status = await client.execute(harness.checkout, {
      name: "get-status",
    });

    expect(status.branch).toBe("main");
    expect(status.hasChanges).toBe(false);
    client.close();
  }, 60_000);

  it("keeps one connection's commit free of another connection's work", async () => {
    const harness = await startBroker();
    const web = await connect(harness);
    await web.execute(harness.checkout, { name: "initialize" });
    const worker = await connect(harness);

    const hooks = join(scratch ?? "", "hooks");
    const started = join(scratch ?? "", "hook-started");
    await mkdir(hooks, { recursive: true });
    await writeFile(
      join(hooks, "pre-commit"),
      [
        "#!/bin/sh",
        `if [ ! -e "${started}" ]; then`,
        `  touch "${started}"`,
        "  sleep 1.5",
        "fi",
        "exit 0",
      ].join("\n"),
      { mode: 0o755 },
    );
    await git(["config", "core.hooksPath", hooks], harness.checkout);

    await writeFile(join(harness.checkout, "web.md"), "web work\n");
    const webCommit = web.execute(harness.checkout, {
      name: "commit",
      message: "web change",
    });

    expect(await untilExists(started)).toBe(true);
    await writeFile(join(harness.checkout, "worker.md"), "worker work\n");
    const workerCommit = worker.execute(harness.checkout, {
      name: "commit",
      message: "worker change",
    });

    await Promise.all([webCommit, workerCommit]);

    // Two connections, one owner: neither commit may contain the other's file.
    expect(await commitTouching(harness.checkout, "web.md")).toEqual([
      "web.md",
    ]);
    expect(await commitTouching(harness.checkout, "worker.md")).toEqual([
      "worker.md",
    ]);

    web.close();
    worker.close();
  }, 120_000);

  it("refuses a checkout it does not own", async () => {
    const harness = await startBroker();
    const client = await BrokerConnection.connect(harness.socketPath);

    const outcome = await client
      .registerCheckout({
        checkoutPath: join(harness.checkout, "..", "elsewhere"),
        branch: "main",
        remoteFingerprint: FINGERPRINT,
      })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(outcome).toContain("owns no checkout");
    client.close();
  }, 60_000);

  it("refuses registration that drifts from the configured identity", async () => {
    const harness = await startBroker();
    const client = await BrokerConnection.connect(harness.socketPath);

    const outcome = await client
      .registerCheckout({
        checkoutPath: harness.checkout,
        branch: "other-branch",
        remoteFingerprint: FINGERPRINT,
      })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    // Drift would silently move ownership to a different repository while
    // every client believed it shared one owner.
    expect(outcome).toContain("different branch or remote identity");
    client.close();
  }, 60_000);

  it("keeps the socket owner-only and refuses a second live broker", async () => {
    const harness = await startBroker();

    expect((await stat(harness.socketPath)).mode & 0o777).toBe(0o600);
    expect((await stat(harness.runtimeDir)).mode & 0o777).toBe(0o700);

    const second = await GitBrokerServer.start({
      runtimeDir: harness.runtimeDir,
      resolveCheckout: () => undefined,
    }).then(
      (started) => started.stop().then(() => undefined),
      (error: unknown) => error,
    );

    expect(second).toBeInstanceOf(BrokerStartupError);
  }, 60_000);

  it("tells a waiting caller the broker is gone rather than hanging", async () => {
    const harness = await startBroker();
    const client = await connect(harness);
    await client.execute(harness.checkout, { name: "initialize" });

    await broker?.stop();
    broker = undefined;
    // Let the client observe the close before it sends.
    await Bun.sleep(50);

    const outcome = await client
      .execute(harness.checkout, { name: "get-status" })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    // Silence is the failure mode this design exists to remove; a caller must
    // learn its owner vanished.
    expect(outcome).toContain("unavailable");
  }, 60_000);
});
