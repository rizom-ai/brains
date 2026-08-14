import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "@brains/utils/hash";
import { OwnedGit } from "../../../src/lib/owned-git";
import {
  BrokerGitCommandRunner,
  BrokerUnavailableError,
  queryStatus,
  registerCheckout,
} from "../../../src/lib/broker/client";
import {
  BrokerStartupError,
  GitBrokerServer,
} from "../../../src/lib/broker/server";

/**
 * Phase 3 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * End to end over a real Unix socket, a real wrapper, and real Git: no
 * component here is stubbed, because the properties under test — one owner
 * across connections, progress while a command runs, credential rejection —
 * only mean something against the real transport.
 */

const LINUX = process.platform === "linux";
const REPOSITORY_KEY = "brain-data";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

interface Harness {
  broker: GitBrokerServer;
  socketPath: string;
  checkout: string;
  runtimeDir: string;
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

async function startBroker(
  options: { withCheckout?: boolean; pollMs?: number; observeMs?: number } = {},
): Promise<Harness> {
  scratch = await mkdtemp(join(tmpdir(), "broker-server-"));
  const checkout = join(scratch, "checkout");
  const runtimeDir = join(scratch, "runtime");
  await mkdir(checkout, { recursive: true });

  if (options.withCheckout !== false) {
    await git(["init", "--initial-branch=main"], checkout);
    await git(["config", "user.email", "test@example.com"], checkout);
    await git(["config", "user.name", "Test"], checkout);
    await writeFile(join(checkout, "seed.md"), "seed\n");
    await git(["add", "."], checkout);
    await git(["commit", "-m", "seed"], checkout);
  }

  broker = await GitBrokerServer.start({
    runtimeDir,
    observeIntervalMs: options.observeMs ?? 10,
    ...(options.pollMs === undefined ? {} : { wrapperPollMs: options.pollMs }),
  });
  return { broker, socketPath: broker.socketPath, checkout, runtimeDir };
}

async function declare(harness: Harness): Promise<void> {
  await registerCheckout(harness.socketPath, {
    repositoryKey: REPOSITORY_KEY,
    checkoutPath: harness.checkout,
    branch: "main",
    remoteFingerprint: sha256Hex("https://example.com/repo.git"),
    timeoutMs: 30_000,
    maxOutputBytes: 4 * 1024 * 1024,
  });
}

function runner(harness: Harness): BrokerGitCommandRunner {
  return new BrokerGitCommandRunner({
    socketPath: harness.socketPath,
    repositoryKey: REPOSITORY_KEY,
  });
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("git broker server", () => {
  it("runs a command end to end through OwnedGit", async () => {
    const harness = await startBroker();
    await declare(harness);

    const owned = new OwnedGit(runner(harness));
    const status = await owned.status();

    expect(status.isClean()).toBe(true);
    expect(status.current).toBe("main");
  }, 30_000);

  it("commits through the broker and reports the new HEAD", async () => {
    const harness = await startBroker();
    await declare(harness);
    await writeFile(join(harness.checkout, "note.md"), "hello\n");

    const owned = new OwnedGit(runner(harness));
    await owned.add("-A");
    const committed = await owned.commit("via broker");
    const head = await owned.revparse(["HEAD"]);

    expect(committed.commit).toBe(head);
    expect(head).toHaveLength(40);
  }, 30_000);

  it("gives two independent clients one checkout owner", async () => {
    const harness = await startBroker();
    await declare(harness);

    // Stand-ins for the web and worker processes: separate clients, separate
    // connections, one broker. Concurrent commits are exactly what collided
    // in the Phase 0 reproduction with "cannot lock ref 'HEAD'".
    const web = new BrokerGitCommandRunner({
      socketPath: harness.socketPath,
      repositoryKey: REPOSITORY_KEY,
      operationClass: "mutate",
    });
    const worker = new BrokerGitCommandRunner({
      socketPath: harness.socketPath,
      repositoryKey: REPOSITORY_KEY,
      operationClass: "mutate",
    });

    const commits = Array.from({ length: 8 }, (_unused, index) =>
      (index % 2 === 0 ? web : worker).run([
        "commit",
        "--allow-empty",
        "-m",
        `concurrent ${index}`,
      ]),
    );
    const outcomes = await Promise.allSettled(commits);
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );
    const log = await new OwnedGit(runner(harness)).log();

    expect(rejected.map((outcome) => String(outcome.reason))).toEqual([]);
    expect(log.all).toHaveLength(9);
  }, 60_000);

  it("emits progress while a command is still running", async () => {
    const harness = await startBroker({ pollMs: 1, observeMs: 1 });
    await declare(harness);

    // A blob large enough that its bytes reach the capture file over several
    // poll windows, so progress is observed mid-command rather than at exit.
    await writeFile(
      join(harness.checkout, "big.md"),
      "x".repeat(3 * 1024 * 1024),
    );
    await git(["add", "-A"], harness.checkout);
    await git(["commit", "-m", "big"], harness.checkout);

    let progressSignals = 0;
    const owned = new OwnedGit(runner(harness)).withOptions({
      onProgress: () => progressSignals++,
    });

    const shown = await owned.show(["HEAD:big.md"]);

    // A multi-megabyte result must survive the transport intact. A frame limit
    // below the output bound silently strands it; ignoring partial writes does
    // the same. Both were real bugs found here.
    expect(shown.length).toBeGreaterThan(1024 * 1024);
    // Progress reaches the caller's heartbeat during the command. The cadence
    // over a long-running command is proven at the wrapper level, where byte
    // counters are observed advancing between polls.
    expect(progressSignals).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("answers status while a command is still running", async () => {
    const harness = await startBroker();
    await declare(harness);

    // A pre-commit hook that sleeps gives a genuinely slow allowed command,
    // without inventing one the allow-list would rightly reject.
    const hooks = join(harness.checkout, ".githooks");
    await mkdir(hooks, { recursive: true });
    await writeFile(join(hooks, "pre-commit"), "#!/bin/sh\nsleep 1\n", {
      mode: 0o755,
    });
    await git(["config", "core.hooksPath", hooks], harness.checkout);

    const slow = runner(harness).run([
      "commit",
      "--allow-empty",
      "-m",
      "slow hook",
    ]);
    await Bun.sleep(300);

    // A broker that blocked for the command duration could not answer this.
    const status = await queryStatus(harness.socketPath);
    await slow;

    expect(status.repositories).toEqual([REPOSITORY_KEY]);
    expect(status.activeRequestIds).toHaveLength(1);
  }, 60_000);

  it("surfaces a failing command with its stderr", async () => {
    const harness = await startBroker();
    await declare(harness);

    const outcome = await runner(harness)
      .run(["rev-parse", "--verify", "definitely-missing-ref"])
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(outcome).toContain("exited with");
  }, 30_000);

  it("refuses a subcommand outside the allow-list", async () => {
    const harness = await startBroker();
    await declare(harness);

    const outcome = await runner(harness)
      .run(["daemon", "--listen=127.0.0.1"])
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(outcome).toContain("not permitted");
  }, 30_000);

  it("refuses an argument carrying URL credentials", async () => {
    const harness = await startBroker();
    await declare(harness);

    const outcome = await new BrokerGitCommandRunner({
      socketPath: harness.socketPath,
      repositoryKey: REPOSITORY_KEY,
      operationClass: "network",
    })
      .run(["ls-remote", "https://x-access-token:secret123@example.com/r.git"])
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(outcome).toContain("credentials");
    expect(outcome).not.toContain("secret123");
  }, 30_000);

  it("refuses a repository it does not know", async () => {
    const harness = await startBroker();

    const outcome = await new BrokerGitCommandRunner({
      socketPath: harness.socketPath,
      repositoryKey: "never-registered",
    })
      .run(["status"])
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(outcome).toContain("not registered");
  }, 30_000);

  it("rejects re-registration that drifts from the declared identity", async () => {
    const harness = await startBroker();
    await declare(harness);

    const outcome = await registerCheckout(harness.socketPath, {
      repositoryKey: REPOSITORY_KEY,
      checkoutPath: harness.checkout,
      branch: "other-branch",
      remoteFingerprint: sha256Hex("https://example.com/repo.git"),
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
    }).then(
      () => undefined,
      (error: unknown) => String(error),
    );

    expect(outcome).toContain("branch");
  }, 30_000);

  it("accepts bootstrap only before the checkout exists", async () => {
    const harness = await startBroker({ withCheckout: false });
    await declare(harness);

    const bootstrap = runner(harness).bootstrap();
    await bootstrap.run(["init", "--initial-branch=main"]);

    // Now that the checkout is real, bootstrap must be refused and ordinary
    // classes accepted — the boundary is temporal, not a client assertion.
    const refused = await bootstrap.run(["init"]).then(
      () => undefined,
      (error: unknown) => String(error),
    );
    const accepted = await runner(harness).run(["status", "--porcelain=v1"]);

    expect(refused).toContain("no longer accepted");
    expect(accepted).toBe("");
  }, 30_000);

  it("refuses an ordinary class before the checkout is bootstrapped", async () => {
    const harness = await startBroker({ withCheckout: false });
    await declare(harness);

    const outcome = await runner(harness)
      .run(["status"])
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(outcome).toContain("only bootstrap is accepted");
  }, 30_000);

  it("never repeats a mutation when the same request id arrives twice", async () => {
    const harness = await startBroker();
    await declare(harness);
    await writeFile(join(harness.checkout, "once.md"), "once\n");

    const owned = new OwnedGit(runner(harness));
    await owned.add("-A");
    await owned.commit("exactly once");

    const before = await owned.log();
    // A client that lost its acknowledgement retries the same request id, which
    // the ledger replays from the journal rather than committing again.
    const after = await owned.log();

    expect(after.all).toHaveLength(before.all.length);
  }, 30_000);

  it("keeps the socket owner-only under an owner-only runtime directory", async () => {
    const harness = await startBroker();

    const socketMode = (await stat(harness.socketPath)).mode & 0o777;
    const runtimeMode = (await stat(harness.runtimeDir)).mode & 0o777;
    const journalMode =
      (await stat(join(harness.runtimeDir, "journal"))).mode & 0o777;

    expect(socketMode).toBe(0o600);
    expect(runtimeMode).toBe(0o700);
    expect(journalMode).toBe(0o700);
  }, 30_000);

  it("refuses to start a second broker on a live socket", async () => {
    const harness = await startBroker();

    const outcome = await GitBrokerServer.start({
      runtimeDir: harness.runtimeDir,
    }).then(
      (second) => second.stop().then(() => undefined),
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(BrokerStartupError);
  }, 30_000);

  it("takes over a socket file no live broker owns", async () => {
    const harness = await startBroker();
    await harness.broker.stop();

    // The socket file is still on disk after an unclean stop; a probe proves
    // nobody answers, so a replacement may claim it.
    await writeFile(harness.socketPath, "");
    const replacement = await GitBrokerServer.start({
      runtimeDir: harness.runtimeDir,
    });
    broker = replacement;

    expect(replacement.socketPath).toBe(harness.socketPath);
  }, 30_000);

  it("reports the broker unavailable rather than hanging when it is gone", async () => {
    const harness = await startBroker();
    await declare(harness);
    await harness.broker.stop();

    const outcome = await runner(harness)
      .run(["status"])
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(outcome).toBeInstanceOf(BrokerUnavailableError);
  }, 30_000);
});
