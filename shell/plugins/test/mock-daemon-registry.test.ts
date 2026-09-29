import { describe, expect, it } from "bun:test";
import { createMockDaemonRegistry } from "../src/test/mock-daemon-registry";
import type { Daemon } from "@brains/plugins";

function daemon(
  log: string[],
  name: string,
  extra: Partial<Daemon> = {},
): Daemon {
  return {
    start: async (): Promise<void> => {
      log.push(`${name}:start`);
    },
    stop: async (): Promise<void> => {
      log.push(`${name}:stop`);
    },
    ...extra,
  };
}

describe("createMockDaemonRegistry", () => {
  it("registers a daemon stopped, and runs it once started", async () => {
    const log: string[] = [];
    const registry = createMockDaemonRegistry();
    registry.register("worker", daemon(log, "worker"), "plugin-a");

    expect(await registry.getStatuses()).toEqual([
      { name: "worker", pluginId: "plugin-a", status: "stopped" },
    ]);

    await registry.start("worker");

    expect(log).toEqual(["worker:start"]);
    expect((await registry.getStatuses())[0]?.status).toBe("running");
  });

  it("returns to stopped after a stop", async () => {
    const log: string[] = [];
    const registry = createMockDaemonRegistry();
    registry.register("worker", daemon(log, "worker"), "plugin-a");
    await registry.start("worker");

    await registry.stop("worker");

    expect(log).toEqual(["worker:start", "worker:stop"]);
    expect((await registry.getStatuses())[0]?.status).toBe("stopped");
  });

  it("does nothing for a daemon it does not have", async () => {
    // Silently, and that is the point: a test starting a name it never
    // registered gets no error, so the assertion has to be on the effect.
    const registry = createMockDaemonRegistry();

    await registry.start("absent");
    await registry.stop("absent");

    expect(registry.has("absent")).toBe(false);
    expect(registry.getAll()).toEqual([]);
  });

  it("has no health to report for a daemon that declares none", async () => {
    const log: string[] = [];
    const registry = createMockDaemonRegistry();
    registry.register("worker", daemon(log, "worker"), "plugin-a");

    expect(await registry.checkHealth("worker")).toBeUndefined();
    expect(await registry.checkHealth("absent")).toBeUndefined();
  });

  it("reports the health a daemon does declare", async () => {
    const log: string[] = [];
    const registry = createMockDaemonRegistry();
    registry.register(
      "worker",
      daemon(log, "worker", {
        healthCheck: async () => ({ status: "healthy", message: "fine" }),
      }),
      "plugin-a",
    );

    expect(await registry.checkHealth("worker")).toEqual({
      status: "healthy",
      message: "fine",
    });
  });

  it("starts and stops one plugin's daemons without touching another's", async () => {
    const log: string[] = [];
    const registry = createMockDaemonRegistry();
    registry.register("a1", daemon(log, "a1"), "plugin-a");
    registry.register("a2", daemon(log, "a2"), "plugin-a");
    registry.register("b1", daemon(log, "b1"), "plugin-b");

    await registry.startPlugin("plugin-a");

    expect(log).toEqual(["a1:start", "a2:start"]);
    expect(registry.getByPlugin("plugin-a").map((info) => info.name)).toEqual([
      "a1",
      "a2",
    ]);
    const statuses = await registry.getStatuses();
    expect(statuses.find((one) => one.name === "b1")?.status).toBe("stopped");

    await registry.stopPlugin("plugin-a");
    expect(log).toEqual(["a1:start", "a2:start", "a1:stop", "a2:stop"]);
  });

  it("forgets a daemon without stopping it", async () => {
    // unregister and clear drop the record; nothing calls stop on the way
    // out, so a test expecting teardown has to ask for it.
    const log: string[] = [];
    const registry = createMockDaemonRegistry();
    registry.register("worker", daemon(log, "worker"), "plugin-a");
    await registry.start("worker");

    await registry.unregister("worker");

    expect(registry.has("worker")).toBe(false);
    expect(log).toEqual(["worker:start"]);

    registry.register("other", daemon(log, "other"), "plugin-a");
    await registry.clear();
    expect(registry.getAll()).toEqual([]);
  });
});
