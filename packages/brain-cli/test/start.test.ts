import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { EventEmitter } from "events";
import type { BootMode } from "@brains/core";
import { resolveRunnerType, start } from "../src/commands/start";
import {
  resetCanonicalDefinition,
  setCanonicalDefinition,
} from "../src/lib/definition-registry";
import { resetBootFn, setBootFn, type BootedBrain } from "../src/lib/boot";

const definition = {
  name: "brain",
  version: "1.0.0",
  capabilities: [],
  interfaces: [],
};

function createTestBrainDir(): string {
  const dir = join(
    import.meta.dir,
    "tmp",
    `brain-start-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "brain.yaml"), "brain: brain\nbundles: [core]\n");
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
    const isolatedDir = join(
      tmpdir(),
      `brain-start-standalone-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(isolatedDir, { recursive: true });
    try {
      expect(existsSync(join(isolatedDir, "bun.lock"))).toBe(false);
    } finally {
      rmSync(isolatedDir, { recursive: true, force: true });
    }
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

describe("builtin process supervision", () => {
  let testDir: string;
  let previousApiKey: string | undefined;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `brain-supervisor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundles: [core]\n",
    );
    previousApiKey = process.env["AI_API_KEY"];
    process.env["AI_API_KEY"] = "test-key";
    setCanonicalDefinition(definition);
  });

  afterEach(() => {
    if (previousApiKey === undefined) {
      delete process.env["AI_API_KEY"];
    } else {
      process.env["AI_API_KEY"] = previousApiKey;
    }
    rmSync(testDir, { recursive: true, force: true });
    resetBootFn();
    resetCanonicalDefinition();
  });

  it("spawns web then worker children instead of booting the parent runtime", async () => {
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
    child.kill = mock(() => true);
    const workerChild = Object.assign(new EventEmitter(), {
      kill: mock((_signal?: number | NodeJS.Signals) => true),
      exitCode: null,
      killed: false,
    });
    const order: string[] = [];
    let admitSpawn = (): void => {};
    const spawned = new Promise<void>((resolve) => {
      admitSpawn = resolve;
    });
    let spawnCount = 0;
    const spawnImpl = mock(() => {
      order.push("spawn");
      admitSpawn();
      spawnCount += 1;
      return spawnCount === 1 ? child : workerChild;
    });
    const boot = mock(async (): Promise<void> => {
      order.push("migrate");
    });
    setBootFn(boot);

    const resultPromise = start(
      testDir,
      { chat: false },
      {
        argv: ["start"],
        entrypointPath: "/tmp/brain.js",
        spawnImpl,
        processImpl: fakeProcess,
      },
    );

    await spawned;
    expect(spawnImpl).toHaveBeenCalledWith(
      "bun",
      ["/tmp/brain.js", "start", "--child=web"],
      expect.objectContaining({
        cwd: testDir,
        stdio: ["inherit", "inherit", "inherit", "ipc"],
      }),
    );
    expect(boot).toHaveBeenCalledWith(testDir, definition, {
      chat: false,
      operation: "migrate",
    });
    expect(order).toEqual(["migrate", "spawn"]);

    child.emit("message", { type: "runtime-ready" });
    expect(spawnImpl).toHaveBeenLastCalledWith(
      "bun",
      ["/tmp/brain.js", "start", "--child=worker"],
      expect.objectContaining({ cwd: testDir }),
    );
    expect(order).toEqual(["migrate", "spawn", "spawn"]);

    workerChild.emit("message", { type: "worker-ready" });
    fakeProcess.emit("SIGTERM");
    workerChild.emit("close", null, "SIGTERM");
    child.emit("close", null, "SIGTERM");
    expect(await resultPromise).toEqual({ success: true });
  });

  it("does not spawn the web child when parent migrations fail", async () => {
    const spawnImpl = mock(() => {
      throw new Error("must not spawn");
    });
    setBootFn(async () => {
      throw new Error("migration failed");
    });

    const result = await start(
      testDir,
      { chat: false },
      {
        argv: ["start"],
        entrypointPath: "/tmp/brain.js",
        spawnImpl,
      },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("migration failed");
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  const childRoles: Array<"web" | "worker"> = ["web", "worker"];
  it.each(childRoles)(
    "boots the %s child without recursively spawning another child",
    async (childRole) => {
      const spawnImpl = mock(() => {
        throw new Error("nested supervisor");
      });
      const boot = mock(async (): Promise<void> => {});
      setBootFn(boot);

      const result = await start(
        testDir,
        { chat: false },
        {
          argv: ["start", `--child=${childRole}`],
          entrypointPath: "/tmp/brain.js",
          spawnImpl,
        },
      );

      expect(result).toEqual({ success: true });
      expect(spawnImpl).not.toHaveBeenCalled();
      expect(boot).toHaveBeenCalledWith(testDir, definition, {
        chat: false,
        childRole,
        migrationsCompleted: true,
      });
    },
  );
});

describe("resolveRunnerType", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "brain-start-test-"));
    resetCanonicalDefinition();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetBootFn();
    resetCanonicalDefinition();
  });

  it("should return 'builtin' when the definition is registered", () => {
    setCanonicalDefinition(definition);
    expect(resolveRunnerType(testDir)).toBe("builtin");
  });

  it("should return undefined when nothing matches", () => {
    expect(resolveRunnerType(testDir)).toBeUndefined();
  });

  it("should return 'monorepo' for a directory inside the current repo", () => {
    expect(resolveRunnerType(import.meta.dir)).toBe("monorepo");
  });

  it("should pass startup-check mode through to builtin boot without requiring AI_API_KEY", async () => {
    const previousApiKey = process.env["AI_API_KEY"];
    delete process.env["AI_API_KEY"];

    const brainDir = join(
      tmpdir(),
      `brain-start-startup-check-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(
      join(brainDir, "brain.yaml"),
      "brain: brain\nbundles: [core]\n",
    );

    const seenFlags: Array<{
      chat: boolean;
      mode?: BootMode;
    }> = [];
    const stop = mock(async (): Promise<void> => {});
    const bootedBrain: BootedBrain = {
      getShell: () => ({
        getMCPService: () => ({
          getCliTools: () => [],
          listTools: () => [],
        }),
      }),
      stop,
    };
    setCanonicalDefinition(definition);
    setBootFn(async (_cwd, _definition, flags) => {
      seenFlags.push(flags);
      return bootedBrain;
    });

    try {
      const result = await start(brainDir, {
        chat: false,
        mode: "startup-check",
      });

      expect(result.success).toBe(true);
      expect(seenFlags).toEqual([{ chat: false, mode: "startup-check" }]);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env["AI_API_KEY"];
      } else {
        process.env["AI_API_KEY"] = previousApiKey;
      }
      rmSync(brainDir, { recursive: true, force: true });
    }
  });

  it("should forward --startup-check to subprocess runners", async () => {
    const appDir = createTestBrainDir();
    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof mock>;
      exitCode: number | null;
      killed: boolean;
    };
    child.exitCode = null;
    child.killed = false;
    child.kill = mock(() => true);

    let spawnedArgs: string[] = [];
    const spawnImpl = mock((_command: string, args: string[]) => {
      spawnedArgs = args;
      return child as never;
    });

    try {
      const resultPromise = start(
        appDir,
        { chat: false, mode: "startup-check" },
        { spawnImpl },
      );

      child.emit("close", 0, null);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(spawnImpl).toHaveBeenCalled();
      expect(spawnedArgs).toContain("--startup-check");
    } finally {
      rmSync(appDir, { recursive: true, force: true });
    }
  });
});
