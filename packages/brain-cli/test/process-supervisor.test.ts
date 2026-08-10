import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import type { CommandResult } from "../src/lib/command-result";
import {
  startWorkerHeartbeat,
  superviseRuntimeChildren,
  type SupervisorClock,
} from "../src/lib/process-supervisor";

interface TestChild extends EventEmitter {
  kill: ReturnType<typeof mock>;
  exitCode: number | null;
  killed: boolean;
}

interface TestHarness {
  processEvents: EventEmitter & { env: NodeJS.ProcessEnv };
  children: TestChild[];
  clock: SupervisorClock;
  timers: Map<number, { callback: () => void; delayMs: number }>;
  spawnImpl: ReturnType<typeof mock>;
  reportIncident: ReturnType<typeof mock>;
  reportReady: ReturnType<typeof mock>;
  advanceTo(timestamp: number): void;
  fireTimer(delayMs: number): void;
}

function createChild(): TestChild {
  return Object.assign(new EventEmitter(), {
    kill: mock((_signal?: number | NodeJS.Signals) => true),
    exitCode: null,
    killed: false,
  });
}

function createHarness(): TestHarness {
  const processEvents = Object.assign(new EventEmitter(), { env: process.env });
  const children: ReturnType<typeof createChild>[] = [];
  let now = 0;
  let nextTimer = 1;
  const timers = new Map<number, { callback: () => void; delayMs: number }>();
  const clock = {
    now: (): number => now,
    setTimeout: (callback: () => void, delayMs: number): number => {
      const id = nextTimer++;
      timers.set(id, { callback, delayMs });
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      if (typeof handle === "number") timers.delete(handle);
    },
  };
  const spawnImpl = mock(() => {
    const child = createChild();
    children.push(child);
    return child;
  });
  const reportIncident = mock((_incident: Record<string, unknown>) => {});
  const reportReady = mock((_role: "web" | "worker") => {});
  const advanceTo = (timestamp: number): void => {
    now = timestamp;
  };
  const fireTimer = (delayMs: number): void => {
    const entry = [...timers.entries()].find(
      ([, timer]) => timer.delayMs === delayMs,
    );
    if (!entry) throw new Error(`Expected a ${delayMs}ms timer`);
    timers.delete(entry[0]);
    entry[1].callback();
  };

  return {
    processEvents,
    children,
    clock,
    timers,
    spawnImpl,
    reportIncident,
    reportReady,
    advanceTo,
    fireTimer,
  };
}

function supervise(harness: TestHarness): Promise<CommandResult> {
  let session = 0;
  return superviseRuntimeChildren("/brain", "/dist/brain.js", {
    spawnImpl: harness.spawnImpl,
    processImpl: harness.processEvents,
    clock: harness.clock,
    startupTimeoutMs: 100,
    shutdownGraceMs: 50,
    workerRestartBaseMs: 10,
    workerRestartBudget: 3,
    workerRestartWindowMs: 3_600,
    workerHeartbeatIntervalMs: 20,
    reportIncident: harness.reportIncident,
    reportReady: harness.reportReady,
    localDatabaseEndpoint: {
      address: "/tmp/brain-supervisor-owner.sock",
      secret: "s".repeat(48),
    },
    createProcessSessionId: () => `process-session-${++session}`,
  });
}

describe("bundled process supervisor", () => {
  it("emits worker heartbeats every five seconds until stopped", () => {
    const sendHeartbeat = mock(() => {});
    const clearInterval = mock((_handle: number) => {});
    let tick = (): void => {
      throw new Error("Heartbeat interval was not registered");
    };

    const stop = startWorkerHeartbeat(sendHeartbeat, {
      setInterval: (callback, intervalMs): number => {
        tick = callback;
        expect(intervalMs).toBe(5_000);
        return 7;
      },
      clearInterval,
    });

    expect(sendHeartbeat).not.toHaveBeenCalled();
    tick();
    tick();
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);

    stop();
    expect(clearInterval).toHaveBeenCalledWith(7);
  });

  it("starts the worker only after web runtime readiness", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);

    expect(harness.spawnImpl).toHaveBeenCalledTimes(1);
    expect(harness.spawnImpl).toHaveBeenLastCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=web"],
      expect.objectContaining({
        cwd: "/brain",
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        env: expect.objectContaining({
          BRAINS_LOCAL_DATABASE_ENDPOINT: "/tmp/brain-supervisor-owner.sock",
          BRAINS_LOCAL_DATABASE_SECRET: "s".repeat(48),
          BRAINS_LOCAL_DATABASE_SESSION_ID: "process-session-1",
          BRAINS_FORBID_LOCAL_DATABASE_OPEN: "0",
        }),
      }),
    );

    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });

    expect(harness.spawnImpl).toHaveBeenCalledTimes(2);
    web.emit("message", { type: "runtime-ready" });
    expect(harness.spawnImpl).toHaveBeenCalledTimes(2);
    expect(harness.spawnImpl).toHaveBeenLastCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=worker"],
      expect.objectContaining({
        cwd: "/brain",
        env: expect.objectContaining({
          BRAINS_LOCAL_DATABASE_ENDPOINT: "/tmp/brain-supervisor-owner.sock",
          BRAINS_LOCAL_DATABASE_SECRET: "s".repeat(48),
          BRAINS_LOCAL_DATABASE_SESSION_ID: "process-session-2",
          BRAINS_FORBID_LOCAL_DATABASE_OPEN: "1",
        }),
      }),
    );

    const worker = harness.children[1];
    if (!worker) throw new Error("Expected worker child");
    worker.emit("message", { type: "worker-ready" });
    expect(harness.reportReady).toHaveBeenNthCalledWith(1, "web");
    expect(harness.reportReady).toHaveBeenNthCalledWith(2, "worker");
    harness.processEvents.emit("SIGTERM");
    worker.emit("close", null, "SIGTERM");
    web.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({ success: true });
  });

  it("fails when the web child misses its runtime-ready deadline", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);
    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");

    harness.fireTimer(100);
    expect(web.kill).toHaveBeenCalledWith("SIGKILL");
    web.emit("close", null, "SIGKILL");
    expect(await supervised).toEqual({
      success: false,
      message: "Brain web child missed its runtime-ready deadline",
      exitCode: 1,
    });
  });

  it("respawns an exited worker with exponential backoff", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);
    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });

    const firstWorker = harness.children[1];
    if (!firstWorker) throw new Error("Expected first worker");
    firstWorker.emit("close", 1, null);
    expect(harness.spawnImpl).toHaveBeenCalledTimes(2);

    harness.advanceTo(10);
    harness.fireTimer(10);
    expect(harness.spawnImpl).toHaveBeenCalledTimes(3);
    expect(harness.spawnImpl).toHaveBeenLastCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=worker"],
      expect.objectContaining({
        env: expect.objectContaining({
          BRAINS_LOCAL_DATABASE_SESSION_ID: "process-session-3",
          BRAINS_FORBID_LOCAL_DATABASE_OPEN: "1",
        }),
      }),
    );
    expect(harness.reportIncident).toHaveBeenCalledWith({
      type: "worker-exited",
      code: 1,
      signal: null,
      ready: false,
    });

    const secondWorker = harness.children[2];
    if (!secondWorker) throw new Error("Expected second worker");
    secondWorker.emit("message", { type: "worker-ready" });
    harness.processEvents.emit("SIGTERM");
    secondWorker.emit("close", null, "SIGTERM");
    web.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({ success: true });
  });

  it("fails and shuts down when the rolling worker budget is exhausted", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);
    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });

    const first = harness.children[1];
    if (!first) throw new Error("Expected first worker");
    first.emit("close", 1, null);
    harness.advanceTo(10);
    harness.fireTimer(10);

    const second = harness.children[2];
    if (!second) throw new Error("Expected second worker");
    second.emit("close", 1, null);
    harness.advanceTo(30);
    harness.fireTimer(20);

    const third = harness.children[3];
    if (!third) throw new Error("Expected third worker");
    third.emit("close", 1, null);

    expect(harness.spawnImpl).toHaveBeenCalledTimes(4);
    expect(harness.reportIncident).toHaveBeenCalledWith({
      type: "worker-supervision-exhausted",
      attempts: 3,
      windowMs: 3_600,
    });
    expect(web.kill).toHaveBeenCalledWith("SIGTERM");
    expect(
      [...harness.timers.values()].some((timer) => timer.delayMs === 3_570),
    ).toBe(false);

    web.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({
      success: false,
      message: "Brain worker restart budget exhausted after 3 attempts",
      exitCode: 1,
    });
  });

  it("keeps ready worker starts in the rolling restart budget", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);
    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });

    for (const [index, now] of [
      [1, 10],
      [2, 20],
      [3, 30],
    ] as const) {
      const child = harness.children[index];
      if (!child) throw new Error(`Expected worker ${index}`);
      child.emit("message", { type: "worker-ready" });
      child.emit("close", 1, null);
      if (index < 3) {
        harness.advanceTo(now);
        harness.fireTimer(10);
      }
    }

    expect(harness.reportIncident).toHaveBeenCalledWith({
      type: "worker-supervision-exhausted",
      attempts: 3,
      windowMs: 3_600,
    });
    web.emit("close", null, "SIGTERM");
    expect((await supervised).success).toBe(false);
  });

  it("kills a worker that misses its startup deadline and schedules recovery", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);
    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });
    const worker = harness.children[1];
    if (!worker) throw new Error("Expected worker child");

    harness.fireTimer(100);
    expect(worker.kill).toHaveBeenCalledWith("SIGKILL");
    worker.emit("close", null, "SIGKILL");
    expect(
      [...harness.timers.values()].some((timer) => timer.delayMs === 10),
    ).toBe(true);

    harness.processEvents.emit("SIGTERM");
    web.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({ success: true });
  });

  it("kills and replaces a worker after three missed heartbeats", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);
    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });
    const worker = harness.children[1];
    if (!worker) throw new Error("Expected worker child");
    worker.emit("message", { type: "worker-ready" });

    const firstWatchdog = [...harness.timers.entries()].find(
      ([, timer]) => timer.delayMs === 60,
    );
    if (!firstWatchdog) throw new Error("Expected worker heartbeat watchdog");

    worker.emit("message", { type: "worker-heartbeat" });
    expect(harness.timers.has(firstWatchdog[0])).toBe(false);
    expect(
      [...harness.timers.values()].some((timer) => timer.delayMs === 60),
    ).toBe(true);

    harness.fireTimer(60);
    expect(worker.kill).toHaveBeenCalledWith("SIGKILL");
    expect(harness.reportIncident).toHaveBeenCalledWith({
      type: "worker-heartbeat-timeout",
      missedBeats: 3,
      intervalMs: 20,
    });

    worker.emit("close", null, "SIGKILL");
    harness.advanceTo(10);
    harness.fireTimer(10);
    expect(harness.spawnImpl).toHaveBeenCalledTimes(3);

    const replacement = harness.children[2];
    if (!replacement) throw new Error("Expected replacement worker");
    harness.processEvents.emit("SIGTERM");
    replacement.emit("close", null, "SIGTERM");
    web.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({ success: true });
  });

  it("terminates the worker and parent after the web owner exits", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);
    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });
    const worker = harness.children[1];
    if (!worker) throw new Error("Expected worker child");
    worker.emit("message", { type: "worker-ready" });

    web.emit("close", 1, null);
    expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
    worker.emit("close", null, "SIGTERM");

    expect(await supervised).toEqual({
      success: false,
      message: "Brain web child exited with code 1",
      exitCode: 1,
    });
  });

  it("forwards shutdown to both children and escalates after the grace period", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);
    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });
    const worker = harness.children[1];
    if (!worker) throw new Error("Expected worker child");
    worker.emit("message", { type: "worker-ready" });

    harness.processEvents.emit("SIGTERM");
    expect(web.kill).toHaveBeenCalledWith("SIGTERM");
    expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
    harness.fireTimer(50);
    expect(web.kill).toHaveBeenCalledWith("SIGKILL");
    expect(worker.kill).toHaveBeenCalledWith("SIGKILL");

    worker.emit("close", null, "SIGKILL");
    web.emit("close", null, "SIGKILL");
    expect(await supervised).toEqual({ success: true });
  });
});
