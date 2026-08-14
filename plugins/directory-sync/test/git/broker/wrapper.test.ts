import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readWrapperActive,
  readWrapperOutput,
  readWrapperTerminal,
  spawnWrapper,
} from "../../../src/lib/broker/wrapper";
import type { WrapperTerminalState } from "../../../src/lib/broker/wrapper";

/**
 * Phase 2 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * These prove the wrapper owns command safety independently of the broker:
 * the advisory lock, process-group termination, and byte progress all work
 * without any JavaScript completion callback being involved.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;

interface Harness {
  journalDir: string;
  checkout: string;
  lockFile: string;
}

async function harness(): Promise<Harness> {
  scratch = await mkdtemp(join(tmpdir(), "broker-wrapper-"));
  return {
    journalDir: scratch,
    checkout: scratch,
    lockFile: join(scratch, "checkout.lock"),
  };
}

/**
 * Poll the journal the way the broker does — never awaiting the child, only
 * reading its durable artifacts. Recursive rather than a counted loop, and
 * bounded so a wedge fails the assertion instead of hanging the suite.
 */
async function awaitTerminal(
  journalDir: string,
  requestId: string,
  budgetMs = 15_000,
): Promise<WrapperTerminalState | null> {
  const deadline = Date.now() + budgetMs;
  const poll = async (): Promise<WrapperTerminalState | null> => {
    const terminal = await readWrapperTerminal(journalDir, requestId);
    if (terminal) return terminal;
    if (Date.now() >= deadline) return null;
    await Bun.sleep(10);
    return poll();
  };
  return poll();
}

async function untilTrue(
  predicate: () => Promise<boolean>,
  budgetMs = 10_000,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  const poll = async (): Promise<boolean> => {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await Bun.sleep(10);
    return poll();
  };
  return poll();
}

function processGroupExists(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("git broker wrapper", () => {
  it("runs a command and records a terminal result the broker never awaited", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    spawnWrapper({
      requestId: "req_basic00000001",
      journalDir,
      checkout,
      lockFile,
      args: ["version"],
    });

    const terminal = await awaitTerminal(journalDir, "req_basic00000001");
    const output = await readWrapperOutput(journalDir, "req_basic00000001");

    expect(terminal?.outcome).toBe("exit");
    expect(terminal?.exitCode).toBe(0);
    expect(new TextDecoder().decode(output.stdout)).toContain("git version");
  });

  it("reports a non-zero exit without treating it as a timeout", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    spawnWrapper({
      requestId: "req_failure0000001",
      journalDir,
      checkout,
      lockFile,
      args: ["rev-parse", "--verify", "definitely-missing-ref"],
    });

    const terminal = await awaitTerminal(journalDir, "req_failure0000001");

    expect(terminal?.outcome).toBe("exit");
    expect(terminal?.exitCode).not.toBe(0);
  });

  it("serializes two wrappers on one checkout", async () => {
    const { journalDir, checkout, lockFile } = await harness();
    const marker = join(journalDir, "overlap");
    await writeFile(marker, "");

    // Each command appends a start and end marker; interleaving proves the
    // advisory lock failed to serialize them.
    const script = (tag: string): string[] => [
      "-c",
      `alias.mark=!sh -c 'printf "${tag}-start\\n" >> ${marker}; sleep 0.4; printf "${tag}-end\\n" >> ${marker}'`,
      "mark",
    ];

    spawnWrapper({
      requestId: "req_lockfirst00001",
      journalDir,
      checkout,
      lockFile,
      args: script("a"),
    });
    await Bun.sleep(50);
    spawnWrapper({
      requestId: "req_locksecond0001",
      journalDir,
      checkout,
      lockFile,
      args: script("b"),
    });

    const first = await awaitTerminal(journalDir, "req_lockfirst00001");
    const second = await awaitTerminal(journalDir, "req_locksecond0001");
    const order = (await Bun.file(marker).text()).trim().split("\n");

    expect(first?.outcome).toBe("exit");
    expect(second?.outcome).toBe("exit");
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  }, 30_000);

  it("lets different checkouts proceed independently", async () => {
    const { journalDir, checkout } = await harness();
    const marker = join(journalDir, "parallel");
    await writeFile(marker, "");

    const script = (tag: string): string[] => [
      "-c",
      `alias.mark=!sh -c 'printf "${tag}-start\\n" >> ${marker}; sleep 0.4; printf "${tag}-end\\n" >> ${marker}'`,
      "mark",
    ];

    spawnWrapper({
      requestId: "req_parallelone001",
      journalDir,
      checkout,
      lockFile: join(journalDir, "one.lock"),
      args: script("a"),
    });
    spawnWrapper({
      requestId: "req_paralleltwo001",
      journalDir,
      checkout,
      lockFile: join(journalDir, "two.lock"),
      args: script("b"),
    });

    await awaitTerminal(journalDir, "req_parallelone001");
    await awaitTerminal(journalDir, "req_paralleltwo001");
    const order = (await Bun.file(marker).text()).trim().split("\n");

    // Separate locks must interleave; identical ordering would mean the
    // wrapper serialized on something other than the checkout.
    expect(order.slice(0, 2).sort()).toEqual(["a-start", "b-start"]);
  }, 30_000);

  it("kills, waits, and proves the group empty before releasing the lock", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    spawnWrapper({
      requestId: "req_silentgroup001",
      journalDir,
      checkout,
      lockFile,
      timeoutMs: 300,
      termGraceMs: 200,
      args: ["-c", "alias.quiet=!sh -c 'sleep 60'", "quiet"],
    });

    const observed = await untilTrue(async () => {
      const active = await readWrapperActive(journalDir, "req_silentgroup001");
      return (active?.gitPgid ?? 0) > 0;
    });
    const active = await readWrapperActive(journalDir, "req_silentgroup001");
    const pgid = active?.gitPgid ?? 0;

    const terminal = await awaitTerminal(journalDir, "req_silentgroup001");

    expect(observed).toBe(true);
    expect(terminal?.outcome).toBe("timeout");
    // The terminal record is written only after the group is gone, so by the
    // time we can read it the group must already be absent.
    expect(processGroupExists(pgid)).toBe(false);
  }, 30_000);

  it("withholds the terminal result while a SIGTERM-ignoring group is alive", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    // The command ignores SIGTERM, so the group stays alive for the whole
    // grace window. Safety invariant 2 — no unconfirmed unlock — means no
    // terminal result may appear while that group can still mutate the
    // checkout. Without the ignored signal there is no observable window at
    // all, because SIGKILL is immediate.
    spawnWrapper({
      requestId: "req_stubborn00001",
      journalDir,
      checkout,
      lockFile,
      pollMs: 20,
      timeoutMs: 300,
      termGraceMs: 1500,
      args: [
        "-c",
        "alias.stubborn=!sh -c 'trap \"\" TERM; sleep 60'",
        "stubborn",
      ],
    });

    const terminating = await untilTrue(async () => {
      const active = await readWrapperActive(journalDir, "req_stubborn00001");
      return active?.phase === "terminating";
    });

    const active = await readWrapperActive(journalDir, "req_stubborn00001");
    const pgid = active?.gitPgid ?? 0;
    const terminalDuringGrace = await readWrapperTerminal(
      journalDir,
      "req_stubborn00001",
    );

    expect(terminating).toBe(true);
    expect(pgid).toBeGreaterThan(0);
    expect(processGroupExists(pgid)).toBe(true);
    expect(terminalDuringGrace).toBeNull();

    const terminal = await awaitTerminal(journalDir, "req_stubborn00001");
    expect(terminal?.outcome).toBe("timeout");
    expect(processGroupExists(pgid)).toBe(false);
  }, 30_000);

  it("kills a descendant that inherited the output pipes", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    spawnWrapper({
      requestId: "req_descendant0001",
      journalDir,
      checkout,
      lockFile,
      args: ["-c", 'alias.leak=!sh -c \'sleep 30 & printf "%s" "$!"\'', "leak"],
    });

    const terminal = await awaitTerminal(journalDir, "req_descendant0001");
    const output = await readWrapperOutput(journalDir, "req_descendant0001");
    const descendant = Number(new TextDecoder().decode(output.stdout).trim());

    expect(terminal).not.toBeNull();
    expect(descendant).toBeGreaterThan(0);
    expect(
      await untilTrue(async () => {
        try {
          process.kill(descendant, 0);
          return false;
        } catch {
          return true;
        }
      }, 5_000),
    ).toBe(true);
  }, 30_000);

  it("advances byte counters while the command is still running", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    spawnWrapper({
      requestId: "req_progress000001",
      journalDir,
      checkout,
      lockFile,
      pollMs: 20,
      timeoutMs: 10_000,
      args: [
        "-c",
        "alias.drip=!sh -c 'printf a; sleep 0.3; printf b; sleep 0.3; printf c; sleep 0.3'",
        "drip",
      ],
    });

    // Observed strictly before the terminal record exists — this is the
    // progress signal /health/operate depends on during a long clone.
    const sawProgress = await untilTrue(async () => {
      const active = await readWrapperActive(journalDir, "req_progress000001");
      return (active?.stdoutBytes ?? 0) > 0 && active?.phase === "running";
    });

    const terminal = await awaitTerminal(journalDir, "req_progress000001");

    expect(sawProgress).toBe(true);
    expect(terminal?.outcome).toBe("exit");
  }, 30_000);

  it("resets the inactivity deadline on output", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    // Each burst is well inside the deadline, but the total run is far past
    // it: a deadline that did not reset would kill this.
    spawnWrapper({
      requestId: "req_deadline000001",
      journalDir,
      checkout,
      lockFile,
      pollMs: 20,
      timeoutMs: 600,
      args: [
        "-c",
        "alias.drip=!sh -c 'for i in 1 2 3 4 5 6; do printf x; sleep 0.25; done'",
        "drip",
      ],
    });

    const terminal = await awaitTerminal(journalDir, "req_deadline000001");

    expect(terminal?.outcome).toBe("exit");
    expect(terminal?.stdoutBytes).toBe(6);
  }, 30_000);

  it("preserves spaces, newlines, and NUL-delimited records byte for byte", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    spawnWrapper({
      requestId: "req_bytes00000001",
      journalDir,
      checkout,
      lockFile,
      args: [
        "-c",
        "alias.emit=!sh -c 'printf \"my notes/a b.md\\\\000second line\\\\nthird\\\\000\"'",
        "emit",
      ],
    });

    await awaitTerminal(journalDir, "req_bytes00000001");
    const output = await readWrapperOutput(journalDir, "req_bytes00000001");

    expect(Array.from(output.stdout)).toEqual(
      Array.from(new TextEncoder().encode("my notes/a b.md second line\nthird ")),
    );
  }, 30_000);

  it("bounds overflowing output and terminates the command", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    spawnWrapper({
      requestId: "req_overflow000001",
      journalDir,
      checkout,
      lockFile,
      pollMs: 20,
      maxOutputBytes: 2048,
      timeoutMs: 10_000,
      args: [
        "-c",
        "alias.flood=!sh -c 'while true; do printf \"%01000d\" 0; sleep 0.02; done'",
        "flood",
      ],
    });

    const terminal = await awaitTerminal(journalDir, "req_overflow000001");
    const output = await readWrapperOutput(journalDir, "req_overflow000001");

    expect(terminal?.outcome).toBe("overflow");
    expect(terminal?.truncated).toBe(true);
    expect(output.stdout.length).toBeLessThanOrEqual(2048);
  }, 30_000);

  // Phase 2 gate 1. Every later phase rests on this: the broker observes a
  // detached wrapper's durable artifacts instead of awaiting a child, so the
  // completion Bun 1.3.11 can drop is never on the critical path. If this ever
  // fails, keep the protocol, journal, and wrapper and replace only the
  // observation mechanism — do not block the broker and do not poll in-app.
  it("observes consecutive detached wrappers without a lost completion", async () => {
    const { journalDir, checkout, lockFile } = await harness();
    const cycles = 25;

    const outcomes = await Array.from({ length: cycles }).reduce(
      async (
        previous: Promise<string[]>,
        _unused,
        index,
      ): Promise<string[]> => {
        const accumulated = await previous;
        const requestId = `req_gate${String(index).padStart(10, "0")}`;
        spawnWrapper({
          requestId,
          journalDir,
          checkout,
          lockFile,
          args: ["version"],
        });
        const terminal = await awaitTerminal(journalDir, requestId, 10_000);
        return [...accumulated, terminal?.outcome ?? "lost"];
      },
      Promise.resolve([]),
    );

    expect(outcomes).toHaveLength(cycles);
    expect(outcomes.filter((outcome) => outcome !== "exit")).toEqual([]);
  }, 120_000);

  it("keeps the lock and reaches a terminal result after its starter dies", async () => {
    const { journalDir, checkout, lockFile } = await harness();

    // A separate process starts the wrapper and is then killed outright,
    // standing in for a broker that dies mid-request.
    const starter = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
        const { spawnWrapper } = await import(${JSON.stringify(
          join(import.meta.dir, "../../../src/lib/broker/wrapper.ts"),
        )});
        spawnWrapper({
          requestId: "req_orphaned000001",
          journalDir: ${JSON.stringify(journalDir)},
          checkout: ${JSON.stringify(checkout)},
          lockFile: ${JSON.stringify(lockFile)},
          args: ["-c", "alias.slow=!sh -c 'sleep 1; printf done'", "slow"],
        });
        console.log("spawned");
        `,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    await starter.exited;

    // The starter is gone; only the orphaned wrapper can finish this.
    const terminal = await awaitTerminal(journalDir, "req_orphaned000001");
    const output = await readWrapperOutput(journalDir, "req_orphaned000001");

    expect(terminal?.outcome).toBe("exit");
    expect(terminal?.exitCode).toBe(0);
    expect(new TextDecoder().decode(output.stdout)).toBe("done");
  }, 30_000);
});
