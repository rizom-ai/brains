import { afterEach, describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
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
import { BrokerConnection } from "@brains/directory-sync/broker-runtime";
import {
  createBrokerHealthCheck,
  getGitRemoteFingerprint,
  gitBrokerSocketPath,
  probeBrokerActivity,
} from "@brains/directory-sync";
import { EventEmitter } from "node:events";
import { superviseRuntimeChildren } from "../src/lib/process-supervisor";
import type { SignalProcess } from "../src/lib/spawn-bun-runner";
import type { CommandResult } from "../src/lib/command-result";

/**
 * Proving recovery means proving it, not observing signals against a mock, so
 * everything here is real: a real supervisor spawning real child processes, a
 * real broker owning a real Git checkout, a real mutation in flight, and a
 * real crash — the broker is SIGKILLed while its push is still running.
 *
 * The push is held by the remote side, not by anything in the broker: the
 * checkout's `remote.origin.receivepack` sleeps before it starts
 * `git-receive-pack`. That puts a live Git child in the broker's process group
 * when its leader dies, and that child outlives it — which is exactly the
 * state no replacement may start into.
 */

const LINUX = process.platform === "linux";
const ENTRY = join(import.meta.dir, "fixtures", "broker-runtime-child.ts");
/** Long enough to observe the gap; short enough to drain inside the probe budget. */
const REMOTE_HOLD_SECONDS = 3;
const IN_FLIGHT = "req_crash_commit_and_push";

let scratch: string | undefined;
let supervised: Promise<CommandResult> | undefined;
let shutdownRuntime: (() => void) | undefined;
/** Set once the supervised runtime ends, however it ends. */
let runtimeStopped: string | undefined;
/** What the old owner's group still held when absence went unproven. */
let unprovenGroup: string | undefined;
/** What the old owner's group held at the moment a replacement was allowed. */
let replacementDecision: { group: number; members: string[] } | undefined;

interface Harness {
  root: string;
  shutdown: () => void;
  checkout: string;
  socketPath: string;
  supervised: Promise<CommandResult>;
}

async function run(command: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return `${out}${err}`;
}

/**
 * What is still in `group`, captured synchronously.
 *
 * Taken at the moment the supervisor decides, so the answer describes the
 * state the supervisor actually saw rather than whatever settles afterwards.
 */
function groupSnapshot(group: number): string[] {
  const members: string[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let stat: string;
    try {
      stat = readFileSync(`/proc/${entry}/stat`, "utf-8");
    } catch {
      continue;
    }
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (Number(fields[2]) !== group) continue;
    const name = stat.slice(stat.indexOf("(") + 1, stat.lastIndexOf(")"));
    members.push(`${entry}:${fields[0]}:${name}`);
  }
  return members;
}

/**
 * Wait for something the runtime is supposed to do.
 *
 * The runtime is allowed to stop instead — a fail-closed exit is a designed
 * outcome, not a hang — so a wait that outlives it reports how it ended
 * rather than running out its budget. Otherwise a refusal to replace an owner
 * is indistinguishable from a slow one. A wait that is about the aftermath of
 * that exit says so with `afterStop`.
 */
async function until<T>(
  what: string,
  attempt: () => Promise<T | undefined>,
  budgetMs = 20_000,
  options: { afterStop?: boolean } = {},
): Promise<T> {
  const deadline = Date.now() + budgetMs;
  const poll = async (): Promise<T> => {
    const value = await attempt();
    if (value !== undefined) return value;
    if (runtimeStopped !== undefined && !options.afterStop) {
      throw new Error(
        `the runtime stopped while waiting for ${what}: ${runtimeStopped}` +
          (unprovenGroup ? ` (${unprovenGroup})` : ""),
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await Bun.sleep(50);
    return poll();
  };
  return poll();
}

async function readPid(path: string): Promise<number | undefined> {
  const text = await readFile(path, "utf-8").catch(() => undefined);
  return text ? Number(text) : undefined;
}

async function readStarts(root: string, role: string): Promise<string[]> {
  const content = await readFile(join(root, `${role}.starts`), "utf-8").catch(
    () => "",
  );
  return content.trim().split("\n").filter(Boolean);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * A process surface of this harness's own.
 *
 * Signals are delivered for real — group termination has to be real for the
 * proof to mean anything — but the SIGINT/SIGTERM/exit listeners live on an
 * emitter this test owns. Sharing the runner's process meant another test's
 * shutdown signal reached this supervisor and stopped it mid-proof.
 */
function isolatedProcess(options: { groupAlwaysPresent?: boolean } = {}): {
  emitter: EventEmitter;
  impl: SignalProcess;
} {
  const emitter = new EventEmitter();
  const impl: SignalProcess = {
    env: process.env,
    kill: (pid: number, signal?: NodeJS.Signals | 0): boolean => {
      if (options.groupAlwaysPresent && signal === 0) return true;
      return process.kill(pid, signal);
    },
    on: (event, listener) => emitter.on(event, listener),
    removeListener: (event, listener) =>
      emitter.removeListener(event, listener),
  };
  return { emitter, impl };
}

/** A Brain with Git configured, supervised exactly as production is. */
async function runtime(
  options: {
    groupAlwaysPresent?: boolean;
    /**
     * How long the supervisor may spend proving the old group is gone.
     *
     * The default is sized for a group whose surviving Git child really does
     * exit, once the remote stops holding it. A test that forces the probe to
     * never succeed spends the whole budget, so it passes a small one — the
     * budget being exhausted is the behavior under test, not its size.
     */
    probeAttempts?: number;
    probeIntervalMs?: number;
  } = {},
): Promise<Harness> {
  scratch = await mkdtemp(join(tmpdir(), "broker-recovery-"));
  const root = scratch;
  const checkout = join(root, "brain-data");
  const remote = join(root, "content.git");
  await mkdir(checkout, { recursive: true });
  await run(["git", "init", "--bare", "content.git"], root);

  // Read by the child from its working directory, the way the real child
  // reads `brain.yaml` — the harness invents no configuration channel.
  await writeFile(
    join(root, "brain-config.json"),
    JSON.stringify({
      plugins: {
        "directory-sync": {
          git: {
            gitUrl: `file://${remote}`,
            branch: "main",
            authorName: "Test",
            authorEmail: "test@example.com",
          },
        },
      },
    }),
  );

  const runtimeProcess = isolatedProcess(
    options.groupAlwaysPresent ? { groupAlwaysPresent: true } : {},
  );
  const socketPath = gitBrokerSocketPath(join(root, ".brain-runtime"));
  supervised = superviseRuntimeChildren(root, ENTRY, {
    spawnImpl: spawn,
    processImpl: runtimeProcess.impl,
    gitBroker: { socketPath, checkoutPath: join(root, "brain-data") },
    startupTimeoutMs: 30_000,
    shutdownGraceMs: 1_000,
    brokerGroupProbeIntervalMs: options.probeIntervalMs ?? 100,
    brokerGroupProbeAttempts: options.probeAttempts ?? 150,
    reportIncident: (incident) => {
      // Both decisions are about a group whose state is gone by the time the
      // assertion runs, so each is recorded where it happens. The pid file
      // still names the old owner: the replacement has not started yet.
      const type = incident["type"];
      if (
        type !== "git-broker-group-absent" &&
        type !== "git-broker-group-absence-unproven"
      ) {
        return;
      }
      const pid = Number(
        readFileSync(join(root, "broker.pid"), "utf-8").trim(),
      );
      const members = groupSnapshot(pid);
      if (type === "git-broker-group-absent") {
        replacementDecision = { group: pid, members };
        return;
      }
      unprovenGroup = `group ${pid} held ${JSON.stringify(members)}`;
    },
    reportReady: () => {},
  });
  void supervised.then(
    (result) => {
      runtimeStopped = JSON.stringify(result);
    },
    (error: unknown) => {
      runtimeStopped = String(error);
    },
  );

  // The endpoint itself is the precondition, not a role that implies one.
  // A unix socket is not a regular file, so its existence is proved by
  // connecting to it rather than by looking for it.
  await until(
    "the broker socket",
    async () => {
      const reached = await BrokerConnection.connect(socketPath).then(
        (connection) => {
          connection.close();
          return true;
        },
        () => undefined,
      );
      if (reached) return true;
      const failure = await readFile(join(root, "broker.error"), "utf-8").catch(
        () => undefined,
      );
      if (failure) throw new Error(`The broker child failed: ${failure}`);
      return undefined;
    },
    30_000,
  );
  await until("the worker to start", async () =>
    (await readPid(join(root, "worker.pid"))) === undefined ? undefined : true,
  );
  return {
    root,
    checkout,
    socketPath,
    supervised,
    shutdown: (): void => void runtimeProcess.emitter.emit("SIGTERM"),
  };
}

afterEach(async () => {
  shutdownRuntime?.();
  await supervised?.catch(() => undefined);
  supervised = undefined;
  shutdownRuntime = undefined;
  runtimeStopped = undefined;
  unprovenGroup = undefined;
  replacementDecision = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

/**
 * Live processes in `group`, read from the OS rather than inferred.
 *
 * A zombie is excluded deliberately: it is an exit status nobody has
 * collected, holding no memory, no file descriptors, and no claim on the
 * checkout. What matters is whether anything can still run.
 */
async function membersOfGroup(
  group: number,
): Promise<Array<{ pid: number; name: string }>> {
  const entries = await readdir("/proc").catch(() => []);
  const members: Array<{ pid: number; name: string }> = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await readFile(`/proc/${entry}/stat`, "utf-8").catch(
      () => undefined,
    );
    if (!stat) continue;
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (fields[0] === "Z") continue;
    if (Number(fields[2]) !== group) continue;
    members.push({
      pid: Number(entry),
      name: stat.slice(stat.indexOf("(") + 1, stat.lastIndexOf(")")),
    });
  }
  return members;
}

/** Owner and identity, the way a role registers before using the checkout. */
async function connectOwner(harness: Harness): Promise<BrokerConnection> {
  const client = await BrokerConnection.connect(harness.socketPath);
  await client.registerCheckout({
    checkoutPath: harness.checkout,
    branch: "main",
    remoteFingerprint: getGitRemoteFingerprint(
      `file://${join(harness.root, "content.git")}`,
    ),
  });
  return client;
}

/**
 * Start a commit-and-push the remote side holds, and wait until it does.
 *
 * Returns the old owner's Git descendants: everything in its group but the
 * leader, with the held `sleep` among them.
 */
async function pushHeldByTheRemote(
  harness: Harness,
  client: BrokerConnection,
  broker: number,
): Promise<{ inFlight: Promise<unknown>; survivors: number[] }> {
  await client.execute(harness.checkout, { name: "initialize" });
  await run(
    [
      "git",
      "config",
      "remote.origin.receivepack",
      `sleep ${REMOTE_HOLD_SECONDS}; git-receive-pack`,
    ],
    harness.checkout,
  );
  await writeFile(join(harness.checkout, "note.md"), "owned\n");
  const inFlight = client
    .executeWithId(IN_FLIGHT, harness.checkout, { name: "commit-and-push" })
    .then(
      () => undefined,
      (error: unknown) => error,
    );
  const survivors = await until("the push to reach the remote", async () => {
    const members = await membersOfGroup(broker);
    return members.some((member) => member.name === "sleep")
      ? members.map((member) => member.pid).filter((pid) => pid !== broker)
      : undefined;
  });
  return { inFlight, survivors };
}

describe.skipIf(!LINUX)("a broker that crashes with work in flight", () => {
  it("is replaced, once, only after its group is gone, without the roles it served going down", async () => {
    const harness = await runtime();
    shutdownRuntime = harness.shutdown;
    const webPid = await readPid(join(harness.root, "web.pid"));
    const workerPid = await readPid(join(harness.root, "worker.pid"));
    const firstBroker = await readPid(join(harness.root, "broker.pid"));
    if (!webPid || !workerPid || !firstBroker) {
      throw new Error("Expected all three roles to have started");
    }

    const client = await connectOwner(harness);
    const { inFlight, survivors } = await pushHeldByTheRemote(
      harness,
      client,
      firstBroker,
    );

    // The crash: nobody asks the owner to stop, and its Git child is mid-push.
    process.kill(firstBroker, "SIGKILL");

    // 1. The caller is told its owner is gone rather than left waiting, and
    //    while the old group drains nothing answers for the checkout. The Git
    //    child outlived its broker: that is the gap no replacement may close.
    expect(String(await inFlight)).toContain("unavailable");
    const gap = await createBrokerHealthCheck({
      probe: probeBrokerActivity(harness.socketPath),
    })();
    expect(gap).toMatchObject({
      status: "unhealthy",
      message: "No Git checkout owner answered",
    });
    expect(survivors.some((pid) => isAlive(pid))).toBe(true);
    expect(await readStarts(harness.root, "broker")).toEqual([
      String(firstBroker),
    ]);
    expect(isAlive(webPid)).toBe(true);
    expect(isAlive(workerPid)).toBe(true);

    // 2. Exactly one replacement, allowed only once the old group was empty.
    const secondBroker = await until(
      "a replacement broker",
      async () => {
        const starts = await readStarts(harness.root, "broker");
        return starts.length === 2 ? Number(starts[1]) : undefined;
      },
      60_000,
    );
    expect(await readStarts(harness.root, "broker")).toEqual([
      String(firstBroker),
      String(secondBroker),
    ]);
    expect(replacementDecision).toEqual({ group: firstBroker, members: [] });
    expect(survivors.filter((pid) => isAlive(pid))).toEqual([]);

    // The roles it served were never restarted.
    expect(isAlive(webPid)).toBe(true);
    expect(isAlive(workerPid)).toBe(true);
    expect(await readStarts(harness.root, "web")).toEqual([String(webPid)]);
    expect(await readStarts(harness.root, "worker")).toEqual([
      String(workerPid),
    ]);

    // 3. The replacement replays the old generation's journal: the push it
    //    was running is reported, not re-run, and mutation stays closed until
    //    a role reconciles from repository facts. The pid file is announced
    //    before the child binds its socket, so the endpoint is waited on.
    const replacement = await until(
      "the replacement broker socket",
      async () => connectOwner(harness).catch(() => undefined),
      60_000,
    );
    const pendingRecovery = await replacement.status();
    expect(pendingRecovery).toMatchObject({
      recoveryPending: true,
      admitsMutations: false,
      ambiguousRequestIds: [IN_FLIGHT],
      evidenceComplete: true,
    });
    const recoveringHealth = await createBrokerHealthCheck({
      probe: probeBrokerActivity(harness.socketPath),
    })();
    expect(recoveringHealth.status).toBe("degraded");
    expect(
      await replacement.execute(harness.checkout, { name: "commit" }).then(
        () => "admitted",
        (error: unknown) => String(error),
      ),
    ).toContain("admission is closed");
    const delta = await replacement.execute(harness.checkout, {
      name: "get-reconciliation-delta",
    });
    expect(delta).toMatchObject({
      mode: "full",
      reason: "missing-checkpoint",
    });
    await replacement.openAdmission();
    const recoveredHealth = await createBrokerHealthCheck({
      probe: probeBrokerActivity(harness.socketPath),
    })();
    expect(recoveredHealth.status).toBe("healthy");
    replacement.close();

    // 4. The commit that landed before the crash is present exactly once.
    //    Counted against the file the mutation touched: establishing the
    //    branch is its own commit, and the claim is about the work.
    const landed = await run(
      ["git", "log", "--format=%H", "--", "note.md"],
      harness.checkout,
    );
    expect(landed.trim().split("\n").filter(Boolean)).toHaveLength(1);

    client.close();
  }, 300_000);

  it("starts no replacement when the old group cannot be proven gone", async () => {
    // The injection is the probe's answer, not a process that resists SIGKILL:
    // an unkillable process is not constructible on demand, and the decision
    // under test is what the supervisor does when absence cannot be
    // established. Everything else here is real — real children, a real
    // broker, a real crash with a real Git child left running.
    // A small probe budget: the probe here can never succeed, so the full
    // budget is spent every run.
    const harness = await runtime({
      groupAlwaysPresent: true,
      probeAttempts: 10,
      probeIntervalMs: 20,
    });
    shutdownRuntime = harness.shutdown;
    const webPid = await readPid(join(harness.root, "web.pid"));
    const firstBroker = await readPid(join(harness.root, "broker.pid"));
    if (!webPid || !firstBroker) {
      throw new Error("Expected the roles to have started");
    }

    const client = await connectOwner(harness);
    const { inFlight } = await pushHeldByTheRemote(
      harness,
      client,
      firstBroker,
    );
    process.kill(firstBroker, "SIGKILL");

    // The whole runtime fails rather than replacing an owner whose Git
    // children might still be writing to the checkout.
    const result = await harness.supervised;
    expect(result.success).toBe(false);
    expect(result.message).toContain("could not be proven gone");
    expect(String(await inFlight)).toContain("unavailable");

    // Exactly one broker ever ran: no replacement was started beside it.
    expect(await readStarts(harness.root, "broker")).toEqual([
      String(firstBroker),
    ]);

    // And the runtime stopped what it could, so external supervision can
    // remove the whole tree before a new generation starts: the roles, and
    // the old group — signalled even though its leader was already gone.
    await until(
      "the roles to stop",
      async () => (isAlive(webPid) ? undefined : true),
      30_000,
      { afterStop: true },
    );
    await until(
      "the old group to empty",
      async () =>
        (await membersOfGroup(firstBroker)).length === 0 ? true : undefined,
      30_000,
      { afterStop: true },
    );

    client.close();
  }, 300_000);
});
