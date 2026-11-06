import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

/** Which file an open handle refers to, and who owns it. */
export interface FileIdentity {
  dev: number;
  ino: number;
  uid: number;
}

/** The two reads holder detection makes under /proc; injectable for tests. */
export interface ProcReader {
  readdir(path: string): Promise<string[]>;
  /** Follows a /proc/<pid>/fd/<n> link to the open file itself. */
  stat(path: string): Promise<FileIdentity>;
}

const procReader: ProcReader = {
  readdir: (path) => readdir(path),
  stat: async (path) => {
    const { dev, ino, uid } = await stat(path);
    return { dev, ino, uid };
  },
};

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
  const watched = [path, `${path}-wal`, `${path}-shm`];
  const files = (
    await Promise.all(
      watched.map((file) => procReader.stat(file).catch(() => undefined)),
    )
  ).filter((file): file is FileIdentity => file !== undefined);
  const viaProc = await readdir("/proc").then(
    () => findProcHolders(files, procReader),
    () => null,
  );
  return viaProc === null ? lsofHolders(watched) : viaProc;
}

/**
 * Processes with one of `files` open, matched by device and inode so a
 * symlinked path or another mount namespace still matches. A process whose
 * handles cannot be read counts as a possible holder when it runs as the
 * database's owner and that owner is not the operator, so the result is undefined ("cannot tell"); unreadable
 * processes of other users, and processes that exit meanwhile, are skipped.
 */
export async function findProcHolders(
  files: readonly FileIdentity[],
  proc: ProcReader,
  operatorUid: number = process.getuid?.() ?? -1,
): Promise<number[] | undefined> {
  // The operator's own unreadable processes are non-dumpable (sd-pam, agents);
  // a brain app the operator runs is always readable.
  const owners = new Set(
    files.map((file) => file.uid).filter((uid) => uid !== operatorUid),
  );
  const opened = (handle: FileIdentity): boolean =>
    files.some((file) => file.dev === handle.dev && file.ino === handle.ino);
  const pids = (await proc.readdir("/proc")).filter(
    (entry) => /^\d+$/.test(entry) && Number(entry) !== process.pid,
  );
  const verdicts = await Promise.all(
    pids.map(async (pid): Promise<"holds" | "unknown" | "clear"> => {
      const fds = await proc
        .readdir(`/proc/${pid}/fd`)
        .catch((error: unknown) => error);
      if (!Array.isArray(fds)) {
        if (!isPermissionError(fds)) return "clear";
        const runsAs = await proc.stat(`/proc/${pid}`).catch(() => undefined);
        return runsAs && owners.has(runsAs.uid) ? "unknown" : "clear";
      }
      const handles = await Promise.all(
        fds.map((fd) =>
          proc.stat(`/proc/${pid}/fd/${fd}`).catch(() => undefined),
        ),
      );
      return handles.some((handle) => handle && opened(handle))
        ? "holds"
        : "clear";
    }),
  );
  if (verdicts.includes("unknown")) return undefined;
  return pids
    .filter((_, index) => verdicts[index] === "holds")
    .map(Number)
    .sort((a, b) => a - b);
}

function isPermissionError(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  return code === "EACCES" || code === "EPERM";
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
