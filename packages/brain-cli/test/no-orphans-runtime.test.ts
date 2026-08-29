import { afterEach, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtureDir = join(import.meta.dir, "fixtures");
const parentFixture = join(fixtureDir, "no-orphans-parent.ts");
const launcherFixture = join(fixtureDir, "no-orphans-launcher.ts");
const treeNodeFixture = join(fixtureDir, "no-orphans-tree-node.ts");
const tempDirs: string[] = [];
const ownedPids = new Set<number>();
const linuxIt = process.platform === "linux" ? it : it.skip;

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function waitFor(path: string, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${path}`);
    await Bun.sleep(10);
  }
}

function readPid(path: string): number {
  const value = Number.parseInt(readFileSync(path, "utf8"), 10);
  ownedPids.add(value);
  return value;
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0];
    return state !== "Z";
  } catch {
    return false;
  }
}

async function waitDead(pids: readonly number[]): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (pids.some(isRunning)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Processes still running: ${pids.filter(isRunning).join(", ")}`,
      );
    }
    await Bun.sleep(10);
  }
  for (const pid of pids) ownedPids.delete(pid);
}

async function readTreePids(reportDir: string): Promise<number[]> {
  const names = ["parent.pid", "child.pid", "grandchild.pid"];
  await Promise.all(names.map((name) => waitFor(join(reportDir, name))));
  return names.map((name) => readPid(join(reportDir, name)));
}

afterEach(async () => {
  for (const pid of ownedPids) {
    if (!isRunning(pid)) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process can exit between the liveness check and cleanup signal.
    }
  }
  await Bun.sleep(10);
  ownedPids.clear();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

linuxIt(
  "--no-orphans contains clean exits, detached groups, and no siblings",
  async () => {
    const reportDir = createTempDir("brain-no-orphans-clean-");
    const siblingReportDir = createTempDir("brain-no-orphans-sibling-");
    const sibling = Bun.spawn(
      [
        process.execPath,
        treeNodeFixture,
        "sibling",
        siblingReportDir,
        "0",
        "0",
      ],
      {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "inherit",
        detached: true,
      },
    );
    ownedPids.add(sibling.pid);
    await waitFor(join(siblingReportDir, "sibling.pid"));

    const parent = Bun.spawn(
      [
        process.execPath,
        "--no-orphans",
        parentFixture,
        reportDir,
        "clean",
        "1",
      ],
      { stdin: "ignore", stdout: "ignore", stderr: "inherit" },
    );
    const treePids = await readTreePids(reportDir);

    expect(await parent.exited).toBe(0);
    await waitDead(treePids);
    expect(isRunning(sibling.pid)).toBe(true);

    sibling.kill("SIGTERM");
    expect(await sibling.exited).toBe(0);
    ownedPids.delete(sibling.pid);
  },
);

linuxIt(
  "--no-orphans removes the complete tree when its original parent dies",
  async () => {
    const reportDir = createTempDir("brain-no-orphans-parent-death-");
    const launcher = Bun.spawn(
      [process.execPath, launcherFixture, reportDir, "1"],
      { stdin: "ignore", stdout: "ignore", stderr: "inherit" },
    );
    ownedPids.add(launcher.pid);
    await waitFor(join(reportDir, "flagged.pid"));
    const flaggedPid = readPid(join(reportDir, "flagged.pid"));
    const treePids = await readTreePids(reportDir);

    launcher.kill("SIGKILL");
    await launcher.exited;
    ownedPids.delete(launcher.pid);
    await waitDead([flaggedPid, ...treePids]);
  },
);

linuxIt(
  "--no-orphans lets ordinary SIGTERM cleanup drain before final containment",
  async () => {
    const reportDir = createTempDir("brain-no-orphans-graceful-");
    const parent = Bun.spawn(
      [process.execPath, "--no-orphans", parentFixture, reportDir, "wait", "1"],
      { stdin: "ignore", stdout: "ignore", stderr: "inherit" },
    );
    const treePids = await readTreePids(reportDir);

    parent.kill("SIGTERM");
    expect(await parent.exited).toBe(0);
    await waitDead(treePids);
    const events = readFileSync(join(reportDir, "events.log"), "utf8");

    for (const event of [
      "parent:sigterm",
      "child:sigterm",
      "grandchild:sigterm",
      "grandchild:drained",
      "child:drained",
      "parent:drained",
    ]) {
      expect(events).toContain(event);
    }
    expect(events.indexOf("grandchild:drained")).toBeLessThan(
      events.indexOf("child:drained"),
    );
    expect(events.indexOf("child:drained")).toBeLessThan(
      events.indexOf("parent:drained"),
    );
  },
);

linuxIt(
  "--no-orphans applies through bun run and filtered workspace scripts",
  async () => {
    const runReportDir = createTempDir("brain-no-orphans-run-");
    const runProject = createTempDir("brain-no-orphans-run-project-");
    writeFileSync(
      join(runProject, "package.json"),
      JSON.stringify({
        name: "no-orphans-run-probe",
        private: true,
        scripts: {
          tree: `bun ${parentFixture} ${runReportDir} clean 1`,
        },
      }),
    );
    const run = Bun.spawn([process.execPath, "--no-orphans", "run", "tree"], {
      cwd: runProject,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
    });
    const runTreePids = await readTreePids(runReportDir);
    expect(await run.exited).toBe(0);
    await waitDead(runTreePids);

    const filterReportDir = createTempDir("brain-no-orphans-filter-");
    const workspace = createTempDir("brain-no-orphans-workspace-");
    const packageDir = join(workspace, "packages", "probe");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(workspace, "package.json"),
      JSON.stringify({
        name: "no-orphans-workspace",
        private: true,
        workspaces: ["packages/*"],
      }),
    );
    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({
        name: "no-orphans-filter-probe",
        private: true,
        scripts: {
          tree: `bun ${parentFixture} ${filterReportDir} clean 1`,
        },
      }),
    );
    const filtered = Bun.spawn(
      [
        process.execPath,
        "--no-orphans",
        "--filter",
        "no-orphans-filter-probe",
        "tree",
      ],
      {
        cwd: workspace,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "inherit",
      },
    );
    const filteredTreePids = await readTreePids(filterReportDir);
    expect(await filtered.exited).toBe(0);
    await waitDead(filteredTreePids);
  },
);
