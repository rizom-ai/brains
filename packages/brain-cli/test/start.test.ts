import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { EventEmitter } from "events";
import { resolveRunnerType, start } from "../src/commands/start";
import { registerModel, resetModels } from "../src/lib/model-registry";

function createTestBrainDir(): string {
  const dir = join(
    import.meta.dir,
    "tmp",
    `brain-start-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "brain.yaml"), "brain: rover\n");
  return dir;
}

describe("brain start", () => {
  it("should detect brain.yaml in target directory", () => {
    const appDir = createTestBrainDir();
    try {
      expect(existsSync(join(appDir, "brain.yaml"))).toBe(true);
    } finally {
      rmSync(appDir, { recursive: true, force: true });
    }
  });

  it("should detect monorepo context by checking for bun.lock", () => {
    const monorepoRoot = join(import.meta.dir, "..", "..", "..");
    expect(existsSync(join(monorepoRoot, "bun.lock"))).toBe(true);
  });

  it("should detect standalone context by absence of bun.lock", () => {
    expect(existsSync("/tmp/bun.lock")).toBe(false);
  });
});

describe("start subprocess lifecycle", () => {
  it("forwards SIGINT to the spawned runner and cleans up listeners", async () => {
    const appDir = createTestBrainDir();

    const fakeProcess = new EventEmitter() as EventEmitter & {
      env: NodeJS.ProcessEnv;
    };
    fakeProcess.env = process.env;

    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof mock>;
      exitCode: number | null;
      killed: boolean;
    };
    child.exitCode = null;
    child.killed = false;
    child.kill = mock((signal?: string) => {
      child.killed = true;
      expect(signal).toBe("SIGINT");
      return true;
    });

    const spawnImpl = mock(() => child as never);

    try {
      const resultPromise = start(
        appDir,
        { chat: false },
        {
          spawnImpl,
          processImpl: fakeProcess as unknown as Pick<
            NodeJS.Process,
            "env" | "on" | "removeListener"
          >,
        },
      );

      expect(fakeProcess.listenerCount("SIGINT")).toBe(1);
      expect(fakeProcess.listenerCount("SIGTERM")).toBe(1);
      expect(fakeProcess.listenerCount("exit")).toBe(1);

      fakeProcess.emit("SIGINT");
      expect(child.kill).toHaveBeenCalledWith("SIGINT");

      child.emit("close", null, "SIGINT");
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(fakeProcess.listenerCount("SIGINT")).toBe(0);
      expect(fakeProcess.listenerCount("SIGTERM")).toBe(0);
      expect(fakeProcess.listenerCount("exit")).toBe(0);
      expect(spawnImpl).toHaveBeenCalled();
    } finally {
      rmSync(appDir, { recursive: true, force: true });
    }
  });
});

describe("resolveRunnerType", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-start-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    resetModels();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetModels();
  });

  it("should return 'builtin' when models are registered", () => {
    registerModel("rover", { name: "rover" });
    expect(resolveRunnerType(testDir)).toBe("builtin");
  });

  it("should return 'docker' when dist/.model-entrypoint.js exists", () => {
    mkdirSync(join(testDir, "dist"), { recursive: true });
    writeFileSync(join(testDir, "dist", ".model-entrypoint.js"), "");
    expect(resolveRunnerType(testDir)).toBe("docker");
  });

  it("should prefer docker over builtin when both exist", () => {
    registerModel("rover", { name: "rover" });
    mkdirSync(join(testDir, "dist"), { recursive: true });
    writeFileSync(join(testDir, "dist", ".model-entrypoint.js"), "");
    expect(resolveRunnerType(testDir)).toBe("docker");
  });

  it("should return undefined when nothing matches", () => {
    expect(resolveRunnerType(testDir)).toBeUndefined();
  });

  it("should return 'monorepo' for a directory inside the current repo", () => {
    expect(resolveRunnerType(import.meta.dir)).toBe("monorepo");
  });
});
