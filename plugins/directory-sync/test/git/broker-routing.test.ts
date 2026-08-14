import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { GitBrokerServer } from "../../src/lib/broker/server";
import { assertExecutableArgs } from "../../src/lib/broker/protocol";
import { GitSync } from "../../src/lib/git-sync";
import { hasGitHead } from "../../src/lib/git-state";

/**
 * Phase 5 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * GitSync driving a real broker over a real socket: bootstrap, ordinary work,
 * and mutation all reach Git without this process ever spawning one.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

async function withBroker(): Promise<{ socketPath: string; dataDir: string }> {
  scratch = await mkdtemp(join(tmpdir(), "broker-routing-"));
  broker = await GitBrokerServer.start({
    runtimeDir: join(scratch, "runtime"),
    observeIntervalMs: 10,
  });
  return { socketPath: broker.socketPath, dataDir: join(scratch, "checkout") };
}

describe("directory-sync routed through the broker", () => {
  it("permits every Git subcommand directory-sync actually issues", async () => {
    const root = join(import.meta.dir, "../../src");
    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) return walk(path);
          return entry.name.endsWith(".ts") ? [path] : [];
        }),
      );
      return nested.flat();
    };

    const bodies = await Promise.all(
      (await walk(root)).map((file) => readFile(file, "utf-8")),
    );
    const used = new Set(
      bodies.flatMap((body) =>
        [...body.matchAll(/\.(?:run|raw)\(\s*\[\s*"([a-z][a-z-]*)"/g)].map(
          (match) => match[1] ?? "",
        ),
      ),
    );

    // A subcommand missing from every class is rejected at the boundary, and a
    // caller that catches its own errors then degrades silently rather than
    // failing — `merge-base` was absent and quietly turned every
    // reconciliation into a full sync. Pin the two lists together.
    const unroutable = [...used].filter((subcommand) =>
      (["inspect", "mutate", "network", "bootstrap"] as const).every(
        (operationClass) => {
          try {
            assertExecutableArgs([subcommand], operationClass);
            return false;
          } catch {
            return true;
          }
        },
      ),
    );

    expect(unroutable.sort()).toEqual([]);
  });

  it("has no direct Git execution outside the broker and wrapper", async () => {
    const root = join(import.meta.dir, "../../src");
    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) return walk(path);
          return entry.name.endsWith(".ts") ? [path] : [];
        }),
      );
      return nested.flat();
    };

    const files = await walk(root);
    const offenders = await Promise.all(
      files.map(async (file) => {
        const body = await readFile(file, "utf-8");
        const spawnsGit =
          body.includes("Bun.spawn") ||
          body.includes("spawnSync") ||
          body.includes("node:child_process");
        return spawnsGit ? file.slice(root.length + 1) : null;
      }),
    );

    expect(
      offenders.filter((file): file is string => file !== null).sort(),
    ).toEqual([
      // Spawning the OS-owned wrapper. This is the execution boundary.
      "lib/broker/wrapper.ts",
      // Local `file://` seed bootstrap: it builds a throwaway worktree and a
      // bare remote, never touching the managed checkout, so it is outside the
      // ownership the broker exists to hold. See the plan's Phase 5 note.
      "lib/content-remote-bootstrap.ts",
    ]);
  });

  it.skipIf(!LINUX)(
    "bootstraps, inspects, and commits without spawning Git here",
    async () => {
      const { socketPath, dataDir } = await withBroker();

      const gitSync = new GitSync({
        logger: createSilentLogger(),
        dataDir,
        branch: "main",
        authorName: "Test",
        authorEmail: "test@example.com",
        brokerSocketPath: socketPath,
      });

      // Bootstrap: init and branch repair run before the checkout exists.
      await gitSync.initialize();
      expect(await hasGitHead(dataDir)).toBe(true);

      // Ordinary work: rejected outright if the bootstrap class had leaked.
      const status = await gitSync.getStatus();
      expect(status.branch).toBe("main");

      await writeFile(join(dataDir, "note.md"), "routed\n");
      expect(await gitSync.hasLocalChanges()).toBe(true);
      await gitSync.commit("through the broker");
      expect(await gitSync.hasLocalChanges()).toBe(false);

      await gitSync.cleanup();
    },
    60_000,
  );

  it.skipIf(!LINUX)(
    "serializes two GitSync owners of one checkout through the broker",
    async () => {
      const { socketPath, dataDir } = await withBroker();
      const options = {
        logger: createSilentLogger(),
        dataDir,
        branch: "main",
        authorName: "Test",
        authorEmail: "test@example.com",
        brokerSocketPath: socketPath,
      };

      const web = new GitSync(options);
      await web.initialize();
      const worker = new GitSync(options);

      // The Phase 0 reproduction: two owners committing concurrently collided
      // on the HEAD ref. One broker-held checkout removes the collision even
      // though the in-memory SerialQueues are still separate.
      const outcomes = await Promise.allSettled(
        Array.from({ length: 6 }, (_unused, index) =>
          (index % 2 === 0 ? web : worker).commit(`concurrent ${index}`),
        ),
      );
      const rejected = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );

      expect(rejected.map((outcome) => String(outcome.reason))).toEqual([]);

      await web.cleanup();
      await worker.cleanup();
    },
    60_000,
  );
});
