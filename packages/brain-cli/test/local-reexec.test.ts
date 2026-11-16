import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import {
  findLocalBrain,
  localBrainToReexec,
  SKIP_LOCAL_REEXEC_ENV,
} from "../src/lib/local-reexec";

const fixture = join(import.meta.dir, "fixtures", "local-reexec-entry.ts");
const localBrainPath = join("node_modules", "@rizom", "brain", "dist");
const posixIt = process.platform === "win32" ? it.skip : it;
const quiet = {
  stdin: "ignore",
  stdout: "ignore",
  stderr: "inherit",
} as const;

/** The test runner's environment, without an inherited opt-out. */
function handOffEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env[SKIP_LOCAL_REEXEC_ENV];
  return env;
}

function killQuietly(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone, which is the expected case.
  }
}

describe("findLocalBrain", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "brain-reexec-test-"));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should return path when local brain exists", () => {
    const brainPath = join(testDir, localBrainPath);
    mkdirSync(brainPath, { recursive: true });
    writeFileSync(join(brainPath, "brain.js"), "// stub");

    const result = findLocalBrain(testDir);
    expect(result).toBe(join(brainPath, "brain.js"));
  });

  it("should return undefined when no local brain", () => {
    const result = findLocalBrain(testDir);
    expect(result).toBeUndefined();
  });

  it("should return undefined when node_modules exists but no brain", () => {
    mkdirSync(join(testDir, "node_modules"), { recursive: true });
    const result = findLocalBrain(testDir);
    expect(result).toBeUndefined();
  });
});

describe("localBrainToReexec", () => {
  let testDir: string;
  let localBrain: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "brain-reexec-target-"));
    localBrain = join(testDir, localBrainPath, "brain.js");
    mkdirSync(dirname(localBrain), { recursive: true });
    writeFileSync(localBrain, "// stub");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("is undefined when this process runs the local install", () => {
    expect(localBrainToReexec(testDir, localBrain, {})).toBeUndefined();
  });

  posixIt("is undefined when this process reached it through a link", () => {
    const bin = join(testDir, "node_modules", ".bin", "brain");
    mkdirSync(dirname(bin), { recursive: true });
    symlinkSync("../@rizom/brain/dist/brain.js", bin);

    expect(localBrainToReexec(testDir, bin, {})).toBeUndefined();
  });

  it("names the local install when this process is another file", () => {
    const globalBrain = join(testDir, "global", "brain.js");

    expect(localBrainToReexec(testDir, globalBrain, {})).toBe(localBrain);
  });

  it("is undefined once a hand-off happened", () => {
    const globalBrain = join(testDir, "global", "brain.js");

    expect(
      localBrainToReexec(testDir, globalBrain, {
        [SKIP_LOCAL_REEXEC_ENV]: "1",
      }),
    ).toBeUndefined();
  });
});

/**
 * The hand-off as the published package runs it: bundled, so `__filename` is
 * the build machine's source path rather than the file being run.
 */
describe("local install hand-off, bundled", () => {
  let root: string;
  let bundle: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "brain-reexec-bundle-"));
    const build = await Bun.build({
      entrypoints: [fixture],
      target: "bun",
      format: "esm",
      minify: true,
    });
    if (!build.success) throw new AggregateError(build.logs, "bundle failed");
    const [output] = build.outputs;
    if (!output) throw new Error("bundle produced no output");
    bundle = await output.text();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function install(path: string): string {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bundle);
    return path;
  }

  function reportLines(reportPath: string): string[] {
    return existsSync(reportPath)
      ? readFileSync(reportPath, "utf8").trim().split("\n")
      : [];
  }

  async function waitForLine(
    reportPath: string,
    prefix: string,
    deadline = Date.now() + 10_000,
  ): Promise<string> {
    const line = reportLines(reportPath).find((entry) =>
      entry.startsWith(prefix),
    );
    if (line) return line;
    if (Date.now() >= deadline) {
      throw new Error(`No "${prefix}" line in ${reportPath}`);
    }
    await Bun.sleep(20);
    return waitForLine(reportPath, prefix, deadline);
  }

  posixIt(
    "runs in place when the local install is the file being run",
    async () => {
      const app = join(root, "app");
      install(join(app, localBrainPath, "brain.js"));
      mkdirSync(join(app, "node_modules", ".bin"), { recursive: true });
      symlinkSync(
        "../@rizom/brain/dist/brain.js",
        join(app, "node_modules", ".bin", "brain"),
      );

      // As the image runs it, and as `bun run brain` reaches it through the
      // bin link.
      for (const entry of [
        "./node_modules/@rizom/brain/dist/brain.js",
        "./node_modules/.bin/brain",
      ]) {
        const reportPath = join(root, `report-${entry.length}.log`);
        const proc = Bun.spawn(
          ["bun", "--no-orphans", entry, reportPath, "once"],
          { cwd: app, env: handOffEnv(), ...quiet },
        );

        expect(await proc.exited).toBe(0);
        expect(reportLines(reportPath)).toEqual([`ran ${proc.pid} -`]);
      }
    },
  );

  posixIt(
    "forwards SIGTERM to a local install it hands off to and exits with its code",
    async () => {
      const app = join(root, "app");
      const localBrain = install(join(app, localBrainPath, "brain.js"));
      const globalBrain = install(join(root, "global", "brain.js"));
      const reportPath = join(root, "report.log");

      const outer = Bun.spawn(["bun", globalBrain, reportPath, "wait"], {
        cwd: app,
        env: handOffEnv(),
        ...quiet,
      });
      let childPid: number | undefined;
      try {
        const [, pid, skip] = (await waitForLine(reportPath, "ran ")).split(
          " ",
        );
        childPid = Number(pid);
        expect(childPid).not.toBe(outer.pid);
        expect(skip).toBe("1");
        expect(localBrain).not.toBe(globalBrain);

        outer.kill("SIGTERM");

        expect(await outer.exited).toBe(0);
        expect(reportLines(reportPath)).toContain(`drained ${childPid}`);
      } finally {
        outer.kill("SIGKILL");
        if (childPid !== undefined) killQuietly(childPid);
      }
    },
  );
});
