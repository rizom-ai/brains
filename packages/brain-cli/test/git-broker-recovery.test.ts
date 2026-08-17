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
import {
  BrokerConnection,
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
 * real broker owning a real Git checkout, a real mutation, and a real Git
 * child whose completion never arrives. Even the stall is real — a push to a
 * remote that accepts the connection and then says nothing, which is what a
 * lost child completion looks like from outside. Managed operations run no
 * hooks, so a hook could not have staged it, and depending on the Bun defect
 * itself would make the proof unrepeatable.
 */

const LINUX = process.platform === "linux";
const ENTRY = join(import.meta.dir, "fixtures", "broker-runtime-child.ts");

let scratch: string | undefined;
let supervised: Promise<CommandResult> | undefined;
let shutdownRuntime: (() => void) | undefined;
/** Set once the supervised runtime ends, however it ends. */
let runtimeStopped: string | undefined;
/** What the old owner's group still held when absence went unproven. */
let unprovenGroup: string | undefined;

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
 * Taken at the moment absence goes unproven, so the answer describes the
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
 * is indistinguishable from a slow one.
 */
async function until<T>(
  what: string,
  attempt: () => Promise<T | undefined>,
  budgetMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + budgetMs;
  const poll = async (): Promise<T> => {
    const value = await attempt();
    if (value !== undefined) return value;
    if (runtimeStopped !== undefined) {
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
  options: { groupAlwaysPresent?: boolean } = {},
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
    gitBroker: { socketPath },
    startupTimeoutMs: 30_000,
    shutdownGraceMs: 1_000,
    // The heartbeat cadence is one shared constant; overriding only the
    // supervisor half would starve a healthy child of the beats it expects.
    brokerProgressTimeoutMs: 1_500,
    brokerGroupProbeIntervalMs: 100,
    brokerGroupProbeAttempts: 40,
    reportIncident: (incident) => {
      // An unproven group is the one failure whose cause is gone by the
      // time the assertion runs, so it is recorded where it happens.
      if (incident["type"] !== "git-broker-group-absence-unproven") return;
      const pid = Number(
        readFileSync(join(root, "broker.pid"), "utf-8").trim(),
      );
      unprovenGroup = `group ${pid} held ${JSON.stringify(groupSnapshot(pid))}`;
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
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

/**
 * A remote that accepts the connection and then says nothing.
 *
 * This is how completion is withheld after a real mutation: the commit is
 * written and durable, and the push that follows it never finishes. Hooks
 * cannot be used — managed operations refuse to run them — and depending on
 * the Bun defect to reproduce itself would make the proof unrepeatable.
 */
function silentRemote(): { gitUrl: string; stop: () => void } {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: (): void => {}, open: (): void => {} },
  });
  return {
    gitUrl: `git://127.0.0.1:${server.port}/repo.git`,
    stop: (): void => {
      server.stop(true);
    },
  };
}

/**
 * Live processes in `group`, read from the OS rather than inferred.
 *
 * A zombie is excluded deliberately: it is an exit status nobody has
 * collected, holding no memory, no file descriptors, and no claim on the
 * checkout. What matters is whether anything can still run.
 */
async function membersOfGroup(group: number): Promise<number[]> {
  const entries = await readdir("/proc").catch(() => []);
  const members: number[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await readFile(`/proc/${entry}/stat`, "utf-8").catch(
      () => undefined,
    );
    if (!stat) continue;
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (fields[0] === "Z") continue;
    if (Number(fields[2]) === group) members.push(Number(entry));
  }
  return members;
}
describe.skipIf(!LINUX)("a broker that stops completing work", () => {
  it("is replaced, once, without the roles it served going down", async () => {
    const harness = await runtime();
    shutdownRuntime = harness.shutdown;
    const webPid = await readPid(join(harness.root, "web.pid"));
    const workerPid = await readPid(join(harness.root, "worker.pid"));
    const firstBroker = await readPid(join(harness.root, "broker.pid"));
    if (!webPid || !workerPid || !firstBroker) {
      throw new Error("Expected all three roles to have started");
    }

    const client = await BrokerConnection.connect(harness.socketPath);
    await client.registerCheckout({
      checkoutPath: harness.checkout,
      branch: "main",
      remoteFingerprint: getGitRemoteFingerprint(
        `file://${join(harness.root, "content.git")}`,
      ),
    });
    await client.execute(harness.checkout, { name: "initialize" });

    // A real mutation whose completion never arrives: the commit is written,
    // then the push waits on a remote that never answers.
    const remote = silentRemote();
    await run(
      ["git", "remote", "set-url", "origin", remote.gitUrl],
      harness.checkout,
    );
    await writeFile(join(harness.checkout, "note.md"), "owned\n");
    const stalled = client
      .execute(harness.checkout, { name: "commit-and-push" })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    // 1. The operation stays owned: the turn is held, and the request is
    //    still active because nothing has told the broker it finished.
    await until("an operation to take the turn", async () => {
      const probe = await probeBrokerActivity(harness.socketPath)().catch(
        () => undefined,
      );
      return probe && probe.activeRequestIds.length > 0 ? true : undefined;
    });

    // 2. Operational health degrades, while the roles it serves stay up.
    const health = await createBrokerHealthCheck({
      probe: probeBrokerActivity(harness.socketPath),
      now: () => Date.now(),
      progressTimeoutMs: 1,
    })();
    expect(health.status).toBe("degraded");
    expect(isAlive(webPid)).toBe(true);
    expect(isAlive(workerPid)).toBe(true);

    // 3 and 4. The supervisor terminates the group and proves it absent. The
    //    broker leads its own group, so its Git children are in it — their
    //    death is the evidence that the group went, not just the broker.
    const gitChildren = await until(
      "git children in the broker group",
      async () => {
        const members = await membersOfGroup(firstBroker);
        return members.length > 1 ? members : undefined;
      },
    );
    expect(gitChildren.length).toBeGreaterThan(1);

    await until(
      "the old broker to exit",
      async () => (isAlive(firstBroker) ? undefined : true),
      60_000,
    );
    await until(
      "every git child of the old owner to die",
      async () => {
        // By pid, not by group: this suite spawns hundreds of processes, so
        // the kernel can recycle the old broker's pid as another group's
        // leader — and then an unrelated process answers for a group that
        // is long gone.
        const alive = gitChildren.filter((pid) => isAlive(pid));
        return alive.length === 0 ? true : undefined;
      },
      60_000,
    );

    // 5. Exactly one replacement, and the roles were never restarted.
    const secondBroker = await until(
      "a replacement broker",
      async () => {
        const pid = await readPid(join(harness.root, "broker.pid"));
        return pid !== undefined && pid !== firstBroker ? pid : undefined;
      },
      60_000,
    );

    const starts = await readFile(join(harness.root, "broker.starts"), "utf-8");
    expect(starts.trim().split("\n")).toEqual([
      String(firstBroker),
      String(secondBroker),
    ]);
    expect(isAlive(webPid)).toBe(true);
    expect(isAlive(workerPid)).toBe(true);

    // 6. The mutation that landed is present exactly once, and the client
    //    that lost its owner is told so rather than re-running it.
    expect(String(await stalled)).toContain("unavailable");
    // Counted against the file the mutation touched: establishing the branch
    // is its own commit, and the claim here is about the work, not the
    // repository's whole history.
    const landed = await run(
      ["git", "log", "--format=%H", "--", "note.md"],
      harness.checkout,
    );
    expect(landed.trim().split("\n").filter(Boolean)).toHaveLength(1);

    remote.stop();
    client.close();
  }, 300_000);

  it("starts no replacement when the old group cannot be proven gone", async () => {
    // The injection is the probe's answer, not a process that resists SIGKILL:
    // an unkillable process is not constructible on demand, and the decision
    // under test is what the supervisor does when absence cannot be
    // established. Everything else here is real — real children, a real
    // broker, a real mutation left incomplete.
    const harness = await runtime({ groupAlwaysPresent: true });
    shutdownRuntime = harness.shutdown;
    const webPid = await readPid(join(harness.root, "web.pid"));
    const firstBroker = await readPid(join(harness.root, "broker.pid"));
    if (!webPid || !firstBroker) {
      throw new Error("Expected the roles to have started");
    }

    const client = await BrokerConnection.connect(harness.socketPath);
    await client.registerCheckout({
      checkoutPath: harness.checkout,
      branch: "main",
      remoteFingerprint: getGitRemoteFingerprint(
        `file://${join(harness.root, "content.git")}`,
      ),
    });
    await client.execute(harness.checkout, { name: "initialize" });

    const remote = silentRemote();
    await run(
      ["git", "remote", "set-url", "origin", remote.gitUrl],
      harness.checkout,
    );
    await writeFile(join(harness.checkout, "note.md"), "owned\n");
    const stalled = client
      .execute(harness.checkout, { name: "commit-and-push" })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    // The whole runtime fails rather than replacing an owner whose Git
    // children might still be writing to the checkout.
    const result = await harness.supervised;
    expect(result.success).toBe(false);
    expect(result.message).toContain("could not be proven gone");

    // Exactly one broker ever ran: no replacement was started beside it.
    const starts = await readFile(join(harness.root, "broker.starts"), "utf-8");
    expect(starts.trim().split("\n")).toEqual([String(firstBroker)]);

    // And the roles were stopped, so external supervision can remove the
    // whole tree before a new generation starts.
    await until(
      "the roles to stop",
      async () => (isAlive(webPid) ? undefined : true),
      30_000,
    );

    void stalled;
    remote.stop();
    client.close();
  }, 300_000);
});
