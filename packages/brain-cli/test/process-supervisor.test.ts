import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { superviseWebChild } from "../src/lib/process-supervisor";

function createHarness(): {
  processEvents: EventEmitter & { env: NodeJS.ProcessEnv };
  child: EventEmitter & {
    kill: ReturnType<typeof mock>;
    exitCode: number | null;
    killed: boolean;
  };
  clock: {
    setTimeout(callback: () => void): number;
    clearTimeout(handle: unknown): void;
  };
  timers: Map<number, () => void>;
  spawnImpl: ReturnType<typeof mock>;
} {
  const processEvents = new EventEmitter() as EventEmitter & {
    env: NodeJS.ProcessEnv;
  };
  processEvents.env = process.env;

  const child = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof mock>;
    exitCode: number | null;
    killed: boolean;
  };
  child.exitCode = null;
  child.killed = false;
  child.kill = mock(() => true);

  let nextTimer = 1;
  const timers = new Map<number, () => void>();
  const clock = {
    setTimeout: (callback: () => void): number => {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      if (typeof handle === "number") timers.delete(handle);
    },
  };
  const spawnImpl = mock(() => child as never);

  return { processEvents, child, clock, timers, spawnImpl };
}

describe("bundled process supervisor", () => {
  it("waits for runtime-ready before admitting the web child", async () => {
    const harness = createHarness();
    let settled = false;
    const supervised = superviseWebChild("/brain", "/dist/brain.js", {
      spawnImpl: harness.spawnImpl,
      processImpl: harness.processEvents,
      clock: harness.clock,
      startupTimeoutMs: 100,
    }).then((result) => {
      settled = true;
      return result;
    });

    expect(harness.spawnImpl).toHaveBeenCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=web"],
      expect.objectContaining({
        cwd: "/brain",
        stdio: ["inherit", "inherit", "inherit", "ipc"],
      }),
    );
    expect(settled).toBe(false);

    harness.child.emit("message", { type: "runtime-ready" });
    await Promise.resolve();
    expect(settled).toBe(false);

    harness.child.emit("close", 0, null);
    expect(await supervised).toEqual({ success: true });
  });

  it("escalates parent shutdown after the graceful child deadline", async () => {
    const harness = createHarness();
    const supervised = superviseWebChild("/brain", "/dist/brain.js", {
      spawnImpl: harness.spawnImpl,
      processImpl: harness.processEvents,
      clock: harness.clock,
      startupTimeoutMs: 100,
      shutdownGraceMs: 50,
    });

    harness.child.emit("message", { type: "runtime-ready" });
    harness.processEvents.emit("SIGTERM");
    expect(harness.child.kill).toHaveBeenCalledWith("SIGTERM");

    const forceKillTimer = [...harness.timers.values()][0];
    if (!forceKillTimer) throw new Error("Expected force-kill timer");
    forceKillTimer();
    expect(harness.child.kill).toHaveBeenCalledWith("SIGKILL");

    harness.child.emit("close", null, "SIGKILL");
    expect(await supervised).toEqual({ success: true });
  });

  it("terminates a web child that misses its startup deadline", async () => {
    const harness = createHarness();
    const supervised = superviseWebChild("/brain", "/dist/brain.js", {
      spawnImpl: harness.spawnImpl,
      processImpl: harness.processEvents,
      clock: harness.clock,
      startupTimeoutMs: 100,
    });

    const startupTimer = [...harness.timers.values()][0];
    if (!startupTimer) throw new Error("Expected startup timer");
    startupTimer();
    expect(harness.child.kill).toHaveBeenCalledWith("SIGTERM");

    harness.child.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({
      success: false,
      message: "Brain web child missed its runtime-ready deadline",
      exitCode: 1,
    });
  });
});
