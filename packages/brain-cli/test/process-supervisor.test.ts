import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import type { CommandResult } from "../src/lib/command-result";
import {
  startWorkerHeartbeat,
  superviseRuntimeChildren,
  type SupervisedChildRole,
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
  /** Every kill in the order it happened, as `<child index>:<signal>`. */
  signals: string[];
  clock: SupervisorClock;
  timers: Map<number, { callback: () => void; delayMs: number }>;
  spawnImpl: ReturnType<typeof mock>;
  reportIncident: ReturnType<typeof mock>;
  reportReady: ReturnType<typeof mock>;
  advanceTo(timestamp: number): void;
  fireTimer(delayMs: number): void;
}

function createChild(index: number, signals: string[]): TestChild {
  return Object.assign(new EventEmitter(), {
    kill: mock((signal?: number | NodeJS.Signals) => {
      signals.push(`${index}:${String(signal)}`);
      return true;
    }),
    exitCode: null,
    killed: false,
  });
}

function createHarness(): TestHarness {
  const processEvents = Object.assign(new EventEmitter(), { env: process.env });
  const children: ReturnType<typeof createChild>[] = [];
  const signals: string[] = [];
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
    const child = createChild(children.length, signals);
    children.push(child);
    return child;
  });
  const reportIncident = mock((_incident: Record<string, unknown>) => {});
  const reportReady = mock((_role: SupervisedChildRole) => {});
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
    signals,
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
  });
}

/**
 * A Brain with Git configured. The socket path is the supervisor's to hand
 * out — see docs/plans/directory-sync-git-execution-broker.md, "Canonical
 * ownership endpoint".
 */
function superviseWithBroker(harness: TestHarness): Promise<CommandResult> {
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
    gitBroker: { socketPath: "/run/brain/git-broker.sock" },
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

  it("starts no broker for a Brain without Git", async () => {
    const harness = createHarness();
    const supervised = supervise(harness);

    // Invariant: a Brain with no Git configuration acquires no Git runtime
    // dependency and hosts no owner for a checkout it does not have.
    expect(harness.spawnImpl).toHaveBeenCalledTimes(1);
    expect(harness.spawnImpl).toHaveBeenLastCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=web"],
      expect.objectContaining({ cwd: "/brain" }),
    );

    const web = harness.children[0];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });
    harness.processEvents.emit("SIGTERM");
    harness.children[1]?.emit("close", null, "SIGTERM");
    web.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({ success: true });
  });

  it("starts the git broker before web and hands every role its socket", async () => {
    const harness = createHarness();
    const supervised = superviseWithBroker(harness);

    // The broker owns the checkout, so it leads its own process group: its
    // Git children inherit that group and can be terminated as a unit without
    // touching web or worker.
    expect(harness.spawnImpl).toHaveBeenCalledTimes(1);
    expect(harness.spawnImpl).toHaveBeenLastCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=git-broker"],
      expect.objectContaining({
        cwd: "/brain",
        detached: true,
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        env: expect.objectContaining({
          BRAIN_GIT_BROKER_SOCKET: "/run/brain/git-broker.sock",
        }),
      }),
    );

    const broker = harness.children[0];
    if (!broker) throw new Error("Expected broker child");
    broker.emit("message", { type: "broker-ready" });
    expect(harness.reportReady).toHaveBeenNthCalledWith(1, "git-broker");

    expect(harness.spawnImpl).toHaveBeenCalledTimes(2);
    expect(harness.spawnImpl).toHaveBeenLastCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=web"],
      expect.objectContaining({
        detached: false,
        env: expect.objectContaining({
          BRAIN_GIT_BROKER_SOCKET: "/run/brain/git-broker.sock",
        }),
      }),
    );

    const web = harness.children[1];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });
    expect(harness.spawnImpl).toHaveBeenLastCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=worker"],
      expect.objectContaining({
        detached: false,
        env: expect.objectContaining({
          BRAIN_GIT_BROKER_SOCKET: "/run/brain/git-broker.sock",
        }),
      }),
    );

    harness.processEvents.emit("SIGTERM");
    harness.children[2]?.emit("close", null, "SIGTERM");
    web.emit("close", null, "SIGTERM");
    broker.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({ success: true });
  });

  it("boots no Git-capable role when the broker misses its ready deadline", async () => {
    const harness = createHarness();
    const supervised = superviseWithBroker(harness);
    const broker = harness.children[0];
    if (!broker) throw new Error("Expected broker child");

    harness.fireTimer(100);
    expect(harness.reportIncident).toHaveBeenCalledWith({
      type: "git-broker-startup-timeout",
      timeoutMs: 100,
    });
    expect(broker.kill).toHaveBeenCalledWith("SIGKILL");

    broker.emit("close", null, "SIGKILL");
    // No fallback: without an owner there is no Git-capable role to start.
    expect(harness.spawnImpl).toHaveBeenCalledTimes(1);
    expect(await supervised).toEqual({
      success: false,
      message: "Brain git broker missed its ready deadline",
      exitCode: 1,
    });
  });

  it("fails the whole runtime when the broker exits under healthy roles", async () => {
    const harness = createHarness();
    const supervised = superviseWithBroker(harness);
    const broker = harness.children[0];
    if (!broker) throw new Error("Expected broker child");
    broker.emit("message", { type: "broker-ready" });
    const web = harness.children[1];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });
    const worker = harness.children[2];
    if (!worker) throw new Error("Expected worker child");
    worker.emit("message", { type: "worker-ready" });

    // Until group absence can be proven, a lost owner is the fail-safe case,
    // not a replaceable one: the runtime exits for external cleanup rather
    // than starting a second broker that might race a surviving Git child.
    broker.emit("close", 1, null);
    expect(harness.reportIncident).toHaveBeenCalledWith({
      type: "git-broker-exited",
      code: 1,
      signal: null,
      ready: true,
    });
    expect(harness.spawnImpl).toHaveBeenCalledTimes(3);

    worker.emit("close", null, "SIGTERM");
    web.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({
      success: false,
      message: "Brain git broker exited with code 1",
      exitCode: 1,
    });
  });

  it("stops web and worker before the broker on shutdown", async () => {
    const harness = createHarness();
    const supervised = superviseWithBroker(harness);
    const broker = harness.children[0];
    if (!broker) throw new Error("Expected broker child");
    broker.emit("message", { type: "broker-ready" });
    const web = harness.children[1];
    if (!web) throw new Error("Expected web child");
    web.emit("message", { type: "runtime-ready" });
    const worker = harness.children[2];
    if (!worker) throw new Error("Expected worker child");
    worker.emit("message", { type: "worker-ready" });

    harness.processEvents.emit("SIGTERM");

    // The owner outlives its clients: a role still finishing a Git request
    // must not find the socket gone.
    expect(harness.signals).toEqual(["2:SIGTERM", "1:SIGTERM", "0:SIGTERM"]);

    worker.emit("close", null, "SIGTERM");
    web.emit("close", null, "SIGTERM");
    broker.emit("close", null, "SIGTERM");
    expect(await supervised).toEqual({ success: true });
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
      expect.objectContaining({ cwd: "/brain" }),
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
