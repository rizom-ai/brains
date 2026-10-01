import { readdir, readlink } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Other processes holding a SQLite database, its WAL or its shared-memory
 * file open: a running app keeps all of them open even while idle. Undefined
 * when this platform offers no way to tell, which callers treat as "maybe".
 *
 * Detection reads open file handles rather than taking a lock, because an
 * exclusive SQLite lock in WAL mode breaks a live process that opens next.
 */
export async function findDatabaseHolders(
  databasePath: string,
): Promise<number[] | undefined> {
  const path = resolve(databasePath);
  const watched = new Set([path, `${path}-wal`, `${path}-shm`]);
  return (await procHolders(watched)) ?? (await lsofHolders([...watched]));
}

async function procHolders(
  watched: Set<string>,
): Promise<number[] | undefined> {
  const entries = await readdir("/proc").catch(() => undefined);
  if (!entries) return undefined;
  const holders = await Promise.all(
    entries
      .filter((entry) => /^\d+$/.test(entry) && Number(entry) !== process.pid)
      .map(async (pid) => {
        const fds = await readdir(`/proc/${pid}/fd`).catch(() => []);
        const targets = await Promise.all(
          fds.map((fd) =>
            readlink(`/proc/${pid}/fd/${fd}`).catch(() => undefined),
          ),
        );
        return targets.some((target) => target && watched.has(target))
          ? [Number(pid)]
          : [];
      }),
  );
  return holders.flat().sort((a, b) => a - b);
}

async function lsofHolders(paths: string[]): Promise<number[] | undefined> {
  const child = spawnLsof(paths);
  if (!child) return undefined;
  const [output, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  // lsof exits 1 when no process holds any of the files.
  if (exitCode !== 0 && output.trim() === "") return [];
  if (exitCode !== 0) return undefined;
  return [
    ...new Set(
      output
        .split("\n")
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid !== process.pid),
    ),
  ].sort((a, b) => a - b);
}

function spawnLsof(
  paths: string[],
): Bun.Subprocess<"ignore", "pipe", "ignore"> | undefined {
  try {
    return Bun.spawn(["lsof", "-t", "--", ...paths], {
      stdout: "pipe",
      stderr: "ignore",
    });
  } catch {
    // Spawning fails only when lsof is not installed: then this platform
    // cannot tell who holds the files, which the caller treats as unknown.
    return undefined;
  }
}
