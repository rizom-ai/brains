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

afterEach(async () => {
  await stall?.close();
  stall = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

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

  it("leaves nothing of the operation behind when it stalls", async () => {
    scratch = await mkdtemp(join(tmpdir(), "git-subtree-"));
    const port = 9419;

    // `git daemon` runs its listener in a child of the process Git spawns, so
    // killing only the direct child leaves a listener alive that nobody is
    // watching — and signalling the group is not an option here, because the
    // group is the broker's. The port is the evidence: a surviving listener
    // is reparented away, so looking for it among our children finds nothing
    // while it is still very much running.
    const stalled = runGitCommandWithStallTimeout(
      { baseDir: scratch, timeoutMs: 1_500 },
      ["daemon", "--listen=127.0.0.1", `--port=${port}`, "--base-path=."],
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(await accepts(port, 4_000)).toBe(true);
    expect(await stalled).toBeDefined();

    expect(await accepts(port, 2_000)).toBe(false);
    expect(await childProcessGroups()).toEqual([]);
  }, 60_000);
});
