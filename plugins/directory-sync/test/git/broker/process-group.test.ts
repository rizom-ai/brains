import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGitCommandWithStallTimeout } from "../../../src/lib/broker/git-stall";

/**
 * Phase 6 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * Safety invariant 3: broker replacement waits until "that group and every Git
 * descendant are proven absent". That proof is a probe of the broker's process
 * group, so a Git child that leads a group of its own is invisible to it — the
 * supervisor would signal the broker's group, see ESRCH, call the checkout
 * unowned, and start a replacement beside a push still writing to it.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let stall: { close(): Promise<void>; port: number } | undefined;

/** Accepts the connection and then says nothing, so Git waits. */
async function silentRemote(): Promise<number> {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: (): void => {}, open: (): void => {} },
  });
  stall = {
    port: server.port,
    close: async (): Promise<void> => {
      server.stop(true);
    },
  };
  return server.port;
}

/** This processs own group, which is the one a supervisor would signal. */
async function ownProcessGroup(): Promise<number> {
  const stat = await readFile("/proc/self/stat", "utf-8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return Number(fields[2]);
}

/** Process group of every live child of this process, from the OS. */
async function childProcessGroups(): Promise<number[]> {
  const entries = await readdir("/proc");
  const groups: number[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await readFile(`/proc/${entry}/stat`, "utf-8").catch(
      () => undefined,
    );
    if (!stat) continue;
    // The command can contain spaces and parentheses, so fields are read from
    // after the closing paren: ppid is the second, pgid the third.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const ppid = Number(fields[1]);
    const pgid = Number(fields[2]);
    if (ppid === process.pid) groups.push(pgid);
  }
  return groups;
}

/** Whether anything answers on `port` within the budget. */
async function accepts(port: number, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  const attempt = async (): Promise<boolean> => {
    const open = await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: { data: (): void => {} },
    }).then(
      (socket) => {
        socket.end();
        return true;
      },
      () => false,
    );
    if (open) return true;
    if (Date.now() >= deadline) return false;
    await Bun.sleep(50);
    return attempt();
  };
  return attempt();
}

/** Live `git` processes sharing `group`, read from the OS. */
async function processesInGroup(group: number): Promise<number[]> {
  const entries = await readdir("/proc");
  const members: number[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await readFile(`/proc/${entry}/stat`, "utf-8").catch(
      () => undefined,
    );
    if (!stat) continue;
    const command = stat.slice(stat.indexOf("(") + 1, stat.lastIndexOf(")"));
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (Number(fields[2]) === group && command.includes("git")) {
      members.push(Number(entry));
    }
  }
  return members;
}

afterEach(async () => {
  await stall?.close();
  stall = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

/** A port nobody else in this run is using. */
function freePort(): number {
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: (): void => {} },
  });
  const { port } = probe;
  probe.stop(true);
  return port;
}

describe.skipIf(!LINUX)("a git child of the broker", () => {
  it("stays in the process group the supervisor will terminate", async () => {
    scratch = await mkdtemp(join(tmpdir(), "git-process-group-"));
    const port = await silentRemote();

    // Left running: a hung network operation is the case that matters, since
    // that is what is still alive when the supervisor decides to terminate.
    const hanging = runGitCommandWithStallTimeout(
      { baseDir: scratch, timeoutMs: 30_000 },
      ["ls-remote", "--heads", `git://127.0.0.1:${port}/repo.git`],
    ).catch(() => undefined);

    const groups = await Bun.sleep(500).then(childProcessGroups);
    expect(groups.length).toBeGreaterThan(0);

    // Every Git child shares this process's group, so signalling the group
    // reaches all of them and the absence probe cannot answer early. A child
    // that led a group of its own would show its own pid here instead.
    const own = await ownProcessGroup();
    expect(groups).toEqual(groups.map(() => own));

    await stall?.close();
    await hanging;
  }, 60_000);

  it("leaves anything it could not reap inside the group", async () => {
    scratch = await mkdtemp(join(tmpdir(), "git-subtree-"));
    const port = freePort();

    // `git daemon` forks its listener and lets the parent exit, so the
    // survivor is reparented to init and can no longer be traced from the
    // process that started it. Sweeping descendants cannot promise to catch
    // that; the process group can, and does — which is the guarantee the
    // supervisor's absence probe actually relies on.
    const stalled = runGitCommandWithStallTimeout(
      { baseDir: scratch, timeoutMs: 1_500 },
      ["daemon", "--listen=127.0.0.1", `--port=${port}`, "--base-path=."],
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(await accepts(port, 4_000)).toBe(true);
    expect(await stalled).toBeDefined();
    await Bun.sleep(200);

    const own = await ownProcessGroup();
    const survivors = await processesInGroup(own);
    // Whatever is left is reachable by one signal to the group.
    for (const pid of survivors) {
      process.kill(pid, "SIGKILL");
    }
    await Bun.sleep(200);
    expect(await accepts(port, 1_000)).toBe(false);
  }, 60_000);
});
