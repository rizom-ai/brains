import { describe, it, expect, beforeEach } from "bun:test";
import { Logger } from "@brains/utils";
import { DaemonRegistry } from "../src/daemonRegistry";
import type { Daemon, DaemonHealth } from "@brains/plugins";

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
