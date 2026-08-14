import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { SerialQueue } from "@brains/utils/serial-queue";
import { runGitCommandWithStallTimeout } from "../../src/lib/git-stall";
import type { OwnedGitChild } from "../../src/lib/git-stall";
import { GitSync } from "../../src/lib/git-sync";

/**
 * Phase 0 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * Each `it.failing` below reproduces a defect the Git execution broker must
 * remove. They pass while the defect exists and turn red the moment it is
 * fixed, which is the signal to drop `.failing` and keep the assertion as an
 * ordinary regression test. Do not delete one to make a phase go green.
 *
 * The two remaining Phase 0 reproductions from the plan — client disconnect
 * after mutation but before acknowledgement, and broker death with the wrapper
 * still live — are deferred to Phase 1 on purpose. Both are statements about
 * request IDs and the durable journal, so they cannot be expressed before
 * Phase 1 defines that contract; writing them here would only assert against
 * stubs. Phase 1 owns them.
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (!settle) throw new Error("Deferred promise is not initialized");
      settle(value);
    },
  };
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller): void {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function closedStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller): void {
      controller.close();
    },
  });
}

/** A completion Bun never delivers, as observed on 1.3.11 and 1.3.14. */
function neverSettles(): Promise<number> {
  return new Promise<number>(() => {});
}

/**
 * Give every already-scheduled continuation a chance to run. Bounded and
 * recursive so a wedged operation fails by assertion rather than by hanging
 * the suite until its timeout.
 */
async function drain(ticks = 25): Promise<void> {
  if (ticks === 0) return;
  await Bun.sleep(0);
  return drain(ticks - 1);
}

describe("git execution broker — Phase 0 reproductions", () => {
  it.failing(
    "releases the serialized queue when Git finishes but its completion is lost",
    async () => {
      const killed = deferred<void>();
      // Git wrote its full output and exited; only the completion notification
      // was lost. `exited` and `reaped` therefore never settle.
      const child: OwnedGitChild = {
        pid: 4242,
        exitCode: null,
        stdout: streamOf("Updating 1a2b3c4..5d6e7f8\nFast-forward\n"),
        stderr: closedStream(),
        exited: neverSettles(),
        reaped: neverSettles(),
        killProcessGroup(): void {
          killed.resolve();
        },
      };

      const queue = new SerialQueue();
      let firstSettled = false;
      let secondStarted = false;

      void queue
        .run(() =>
          runGitCommandWithStallTimeout(
            { baseDir: process.cwd(), timeoutMs: 1, spawn: () => child },
            ["pull", "--ff-only"],
          ),
        )
        .then(
          () => {
            firstSettled = true;
          },
          () => {
            firstSettled = true;
          },
        );

      // Barrier: the stall deadline fired and the process group was killed.
      await killed.promise;
      void queue.run(async () => {
        secondStarted = true;
      });
      await drain();

      // The broker's wrapper reaches a terminal result under its own advisory
      // lock, so a lost in-process completion cannot own the checkout forever.
      expect(firstSettled).toBe(true);
      expect(secondStarted).toBe(true);
    },
  );

  it.failing(
    "serializes one checkout across separate GitSync owners",
    async () => {
      const dataDir = await mkdtemp(join(tmpdir(), "broker-owners-"));
      try {
        // Web auto-export and worker sync-request each construct their own
        // GitSync for the same checkout.
        const web = new GitSync({ logger: createSilentLogger(), dataDir });
        const worker = new GitSync({ logger: createSilentLogger(), dataDir });

        const entered = deferred<void>();
        const release = deferred<void>();
        let active = 0;
        let maxActive = 0;

        const occupy = async (): Promise<void> => {
          active++;
          maxActive = Math.max(maxActive, active);
          entered.resolve();
          await release.promise;
          active--;
        };

        const held = web.withLock(occupy);
        await entered.promise;

        const contender = worker.withLock(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          active--;
        });
        await drain();

        release.resolve();
        await Promise.all([held, contender]);

        expect(maxActive).toBe(1);
      } finally {
        await rm(dataDir, { recursive: true, force: true });
      }
    },
  );
});

const RUN_OWNERSHIP_REPRO =
  process.platform === "linux" &&
  process.env["RUN_GIT_OWNERSHIP_REPRO"] === "1";
const OWNERSHIP_CYCLES = Number(
  process.env["GIT_OWNERSHIP_REPRO_CYCLES"] ?? 20,
);

async function git(args: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (${exitCode}): ${await new Response(
        child.stderr,
      ).text()}`,
    );
  }
}

// Opt-in real-Git counterpart to the deterministic ownership reproduction
// above: two owners committing to one checkout collide on the HEAD ref rather
// than queueing. Linux-only and off by default, per the plan's Phase 0. When
// opted in it is expected to fail, on the same terms as the reproductions
// above — remove `.failing` once the broker owns the checkout.
const ownershipRepro = RUN_OWNERSHIP_REPRO ? it.failing : it.skip;

ownershipRepro(
  "real Git: separate owners do not collide on one checkout",
  async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "broker-owners-real-"));
    try {
      await git(["init", "--initial-branch=main"], dataDir);
      await git(["config", "user.email", "test@example.com"], dataDir);
      await git(["config", "user.name", "Test"], dataDir);
      await writeFile(join(dataDir, "seed.md"), "seed\n");
      await git(["add", "."], dataDir);
      await git(["commit", "-m", "seed"], dataDir);

      const logger = createSilentLogger();
      const web = new GitSync({ logger, dataDir });
      const worker = new GitSync({ logger, dataDir });

      const cycle = async (owner: GitSync, tag: string): Promise<void> => {
        const once = async (remaining: number): Promise<void> => {
          if (remaining === 0) return;
          const index = OWNERSHIP_CYCLES - remaining;
          await writeFile(join(dataDir, `${tag}-${index}.md`), `${index}\n`);
          await owner.commit(`${tag} ${index}`);
          return once(remaining - 1);
        };
        return once(OWNERSHIP_CYCLES);
      };

      const outcomes = await Promise.allSettled([
        cycle(web, "web"),
        cycle(worker, "worker"),
      ]);
      const rejected = outcomes.filter((o) => o.status === "rejected");

      expect(rejected.map((o) => String(o.reason))).toEqual([]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  },
  120_000,
);
