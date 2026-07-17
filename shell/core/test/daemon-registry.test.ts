import { describe, it, expect, beforeEach } from "bun:test";
import { Logger } from "@brains/utils/logger";
import { DaemonRegistry } from "../src/daemon-registry";
import type { Daemon, DaemonHealth } from "@brains/plugins";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("DaemonRegistry", () => {
  let registry: DaemonRegistry;
  let logger: Logger;

  beforeEach(() => {
    DaemonRegistry.resetInstance();
    logger = Logger.createFresh();
    registry = DaemonRegistry.createFresh(logger);
  });

  it("should register and retrieve daemons", () => {
    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {},
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");

    expect(registry.has("test-daemon")).toBe(true);
    expect(registry.get("test-daemon")).toBeDefined();
    expect(registry.get("test-daemon")?.pluginId).toBe("test-plugin");
  });

  it("should abandon an unstarted registration idempotently", () => {
    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {},
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");
    registry.abandon("test-daemon");
    registry.abandon("test-daemon");

    expect(registry.has("test-daemon")).toBe(false);
  });

  it("should reject abandoning an active daemon", async () => {
    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {},
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");
    await registry.start("test-daemon");

    expect(() => registry.abandon("test-daemon")).toThrow(
      "Cannot abandon active daemon",
    );

    await registry.stop("test-daemon");
  });

  it("should start and stop daemons", async () => {
    let started = false;
    let stopped = false;

    const mockDaemon: Daemon = {
      start: async () => {
        started = true;
      },
      stop: async () => {
        stopped = true;
      },
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");

    await registry.start("test-daemon");
    expect(started).toBe(true);
    expect(registry.get("test-daemon")?.status).toBe("running");

    await registry.stop("test-daemon");
    expect(stopped).toBe(true);
    expect(registry.get("test-daemon")?.status).toBe("stopped");
  });

  it("should release a started daemon only once", async () => {
    let stopCalls = 0;
    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {
        stopCalls++;
      },
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");
    await registry.start("test-daemon");
    await registry.stop("test-daemon");
    await registry.stop("test-daemon");

    expect(stopCalls).toBe(1);
  });

  it("should reject overwriting a running daemon", async () => {
    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {},
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");
    await registry.start("test-daemon");

    expect(() =>
      registry.register("test-daemon", mockDaemon, "other-plugin"),
    ).toThrow("Cannot overwrite running daemon");

    await registry.stop("test-daemon");
  });

  it("should preserve stop errors and allow a later retry", async () => {
    const stopError = new Error("stop failed");
    let stopCalls = 0;
    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {
        stopCalls++;
        if (stopCalls === 1) throw stopError;
      },
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");
    await registry.start("test-daemon");

    let receivedError: unknown;
    try {
      await registry.stop("test-daemon");
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBe(stopError);
    expect(registry.get("test-daemon")?.status).toBe("error");

    await registry.stop("test-daemon");
    expect(stopCalls).toBe(2);
    expect(registry.get("test-daemon")?.status).toBe("stopped");
  });

  it("currently invokes concurrent starts more than once", async () => {
    const releaseStart = deferred();
    const secondStartEntered = deferred();
    let startCalls = 0;
    const daemon: Daemon = {
      start: async (): Promise<void> => {
        startCalls++;
        if (startCalls === 2) secondStartEntered.resolve();
        await releaseStart.promise;
      },
      stop: async (): Promise<void> => {},
    };
    registry.register("test-daemon", daemon, "test-plugin");

    const firstStart = registry.start("test-daemon");
    await Promise.resolve();
    const secondStart = registry.start("test-daemon");
    await secondStartEntered.promise;

    expect(startCalls).toBe(2);
    releaseStart.resolve();
    await Promise.all([firstStart, secondStart]);
    await registry.stop("test-daemon");
  });

  it("currently invokes concurrent stops more than once", async () => {
    const releaseStop = deferred();
    const secondStopEntered = deferred();
    let stopCalls = 0;
    const daemon: Daemon = {
      start: async (): Promise<void> => {},
      stop: async (): Promise<void> => {
        stopCalls++;
        if (stopCalls === 2) secondStopEntered.resolve();
        await releaseStop.promise;
      },
    };
    registry.register("test-daemon", daemon, "test-plugin");
    await registry.start("test-daemon");

    const firstStop = registry.stop("test-daemon");
    await Promise.resolve();
    const secondStop = registry.stop("test-daemon");
    await secondStopEntered.promise;

    expect(stopCalls).toBe(2);
    releaseStop.resolve();
    await Promise.all([firstStop, secondStop]);
  });

  it("currently lets stop cross an admitted start", async () => {
    const startEntered = deferred();
    const releaseStart = deferred();
    let stopCalls = 0;
    const daemon: Daemon = {
      start: async (): Promise<void> => {
        startEntered.resolve();
        await releaseStart.promise;
      },
      stop: async (): Promise<void> => {
        stopCalls++;
      },
    };
    registry.register("test-daemon", daemon, "test-plugin");

    const starting = registry.start("test-daemon");
    await startEntered.promise;
    await registry.stop("test-daemon");
    expect(stopCalls).toBe(1);

    releaseStart.resolve();
    await starting;
    expect(registry.get("test-daemon")?.status).toBe("running");
    await registry.stop("test-daemon");
  });

  it("should handle daemon health checks", async () => {
    const mockHealth: DaemonHealth = {
      status: "healthy",
      message: "All good",
      lastCheck: new Date(),
    };

    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {},
      healthCheck: async () => mockHealth,
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");

    const health = await registry.checkHealth("test-daemon");
    expect(health).toEqual(mockHealth);
  });

  it("should store error health when daemon health check throws", async () => {
    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {},
      healthCheck: async () => {
        throw new Error("unhealthy");
      },
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");

    const health = await registry.checkHealth("test-daemon");
    expect(health?.status).toBe("error");
    expect(health?.message).toBe("unhealthy");
    expect(registry.get("test-daemon")?.health).toEqual(health);
  });

  it("should refresh health checks when listing statuses", async () => {
    let checks = 0;
    const mockDaemon: Daemon = {
      start: async () => {},
      stop: async () => {},
      healthCheck: async () => {
        checks += 1;
        return { status: "healthy" as const, message: `check-${checks}` };
      },
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");

    const statuses = await registry.getStatuses();
    expect(checks).toBe(1);
    expect(statuses[0]?.health?.message).toBe("check-1");
  });

  it("should preserve the startup error and release a failed daemon", async () => {
    const startError = new Error("boom");
    let stopped = false;
    const mockDaemon: Daemon = {
      start: async () => {
        throw startError;
      },
      stop: async () => {
        stopped = true;
      },
    };

    registry.register("test-daemon", mockDaemon, "test-plugin");

    let receivedError: unknown;
    try {
      await registry.startPlugin("test-plugin");
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBe(startError);
    expect(stopped).toBe(true);
    expect(registry.get("test-daemon")?.status).toBe("stopped");
  });

  it("should roll back plugin daemons in reverse order after partial startup", async () => {
    const order: string[] = [];
    const firstDaemon: Daemon = {
      start: async () => {
        order.push("first-start");
      },
      stop: async () => {
        order.push("first-stop");
      },
    };
    const secondDaemon: Daemon = {
      start: async () => {
        order.push("second-start");
        throw new Error("second failed");
      },
      stop: async () => {
        order.push("second-stop");
      },
    };

    registry.register("first", firstDaemon, "test-plugin");
    registry.register("second", secondDaemon, "test-plugin");

    let receivedError: unknown;
    try {
      await registry.startPlugin("test-plugin");
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBeInstanceOf(Error);
    expect((receivedError as Error).message).toBe("second failed");
    expect(order).toEqual([
      "first-start",
      "second-start",
      "second-stop",
      "first-stop",
    ]);
  });

  it("should manage daemons by plugin", async () => {
    const mockDaemon1: Daemon = {
      start: async () => {},
      stop: async () => {},
    };

    const mockDaemon2: Daemon = {
      start: async () => {},
      stop: async () => {},
    };

    registry.register("daemon1", mockDaemon1, "plugin1");
    registry.register("daemon2", mockDaemon2, "plugin1");
    registry.register("daemon3", mockDaemon1, "plugin2");

    const plugin1Daemons = registry.getByPlugin("plugin1");
    expect(plugin1Daemons).toHaveLength(2);
    expect(plugin1Daemons.map((d) => d.name)).toEqual(["daemon1", "daemon2"]);
  });
});
