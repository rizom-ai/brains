import { expect, it } from "bun:test";
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
import { createSilentLogger } from "@brains/test-utils";
import { createBrokerGitSync } from "./broker-git-sync";

const RUN_SOAK =
  process.platform === "linux" && process.env["RUN_GIT_ZOMBIE_SOAK"] === "1";
const CYCLES = Number(process.env["GIT_ZOMBIE_SOAK_CYCLES"] ?? 100);

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed (${exitCode}): ${await new Response(child.stderr).text()}`,
    );
  }
}

async function countDirectZombieChildren(parentPid: number): Promise<number> {
  const entries = await readdir("/proc", { withFileTypes: true });
  let zombies = 0;

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(async (entry) => {
        try {
          const status = await readFile(`/proc/${entry.name}/status`, "utf8");
          const parent = /^PPid:\s+(\d+)$/m.exec(status)?.[1];
          const state = /^State:\s+(\S)/m.exec(status)?.[1];
          if (Number(parent) === parentPid && state === "Z") zombies++;
        } catch {
          // The process exited between /proc enumeration and status read.
        }
      }),
  );

  return zombies;
}

/**
 * Manual container soak:
 * RUN_GIT_ZOMBIE_SOAK=1 bun test \
 *   plugins/directory-sync/test/git/git-zombie-soak.test.ts
 */
it.skipIf(!RUN_SOAK)(
  "reaps Git children across hundreds of commit/push/pull operations",
  async () => {
    expect(Number.isInteger(CYCLES) && CYCLES > 0).toBe(true);

    const root = await mkdtemp(join(tmpdir(), "git-zombie-soak-"));
    const remoteDir = join(root, "remote.git");
    const dataDir = join(root, "brain-data");
    await mkdir(remoteDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await run(["git", "init", "--bare", "--initial-branch=main"], remoteDir);

    const baselineZombies = await countDirectZombieChildren(process.pid);
    let completedCycles = 0;
    const gitSync = await createBrokerGitSync({
      logger: createSilentLogger("git-zombie-soak"),
      dataDir,
      gitUrl: remoteDir,
      authorName: "Git Soak",
      authorEmail: "git-soak@example.com",
      timeoutMs: 10_000,
    });

    try {
      await gitSync.initialize();
      for (let cycle = 0; cycle < CYCLES; cycle++) {
        await writeFile(join(dataDir, "soak.txt"), `cycle ${cycle}\n`);
        await gitSync.commit(`soak ${cycle}`);
        await gitSync.push();
        await gitSync.pull();
        completedCycles += 1;
      }
    } finally {
      await gitSync.cleanup();
      await rm(root, { recursive: true, force: true });
    }

    const finalZombies = await countDirectZombieChildren(process.pid);
    console.info(
      `GIT_BROKER_PROCESS_INVENTORY_REPORT ${JSON.stringify({
        bunVersion: Bun.version,
        requestedCycles: CYCLES,
        completedCycles,
        completedGitOperations: completedCycles * 3,
        observedLostCompletions: CYCLES - completedCycles,
        baselineZombies,
        finalZombies,
      })}`,
    );
    expect(finalZombies).toBe(baselineZombies);
  },
  120_000,
);
