import type { Daemon, IDaemonRegistry } from "../index";

/**
 * A DaemonRegistry double that really starts and stops.
 *
 * The daemons handed to it are the test's own, so start and stop have to
 * reach them: a registry that only recorded the call would pass every test
 * that checks a daemon actually ran. What it does not model is failure —
 * a daemon that throws leaves its status mid-transition, as the real one
 * would need a policy for and this has none.
 */
export function createMockDaemonRegistry(): IDaemonRegistry {
  const daemons = new Map<
    string,
    {
      name: string;
      daemon: Daemon;
      pluginId: string;
      status: "stopped" | "starting" | "running" | "stopping" | "error";
    }
  >();

  const daemonRegistry: IDaemonRegistry = {
    register: (name, daemon, pluginId) => {
      daemons.set(name, { name, daemon, pluginId, status: "stopped" });
    },
    has: (name) => daemons.has(name),
    get: (name) => daemons.get(name),
    start: async (name) => {
      const info = daemons.get(name);
      if (!info) return;
      info.status = "starting";
      await info.daemon.start();
      info.status = "running";
    },
    stop: async (name) => {
      const info = daemons.get(name);
      if (!info) return;
      info.status = "stopping";
      await info.daemon.stop();
      info.status = "stopped";
    },
    checkHealth: async (name) => {
      const info = daemons.get(name);
      if (!info?.daemon.healthCheck) return undefined;
      return info.daemon.healthCheck();
    },
    getByPlugin: (pluginId) =>
      Array.from(daemons.values()).filter((info) => info.pluginId === pluginId),
    getAll: () => Array.from(daemons.keys()),
    getAllInfo: () => Array.from(daemons.values()),
    getStatuses: async () =>
      Array.from(daemons.values()).map((info) => ({
        name: info.name,
        pluginId: info.pluginId,
        status: info.status,
      })),
    unregister: async (name) => {
      daemons.delete(name);
    },
    startPlugin: async (pluginId) => {
      for (const info of daemons.values()) {
        if (info.pluginId === pluginId) {
          info.status = "starting";
          await info.daemon.start();
          info.status = "running";
        }
      }
    },
    stopPlugin: async (pluginId) => {
      for (const info of daemons.values()) {
        if (info.pluginId === pluginId) {
          info.status = "stopping";
          await info.daemon.stop();
          info.status = "stopped";
        }
      }
    },
    clear: async () => {
      daemons.clear();
    },
  };

  return daemonRegistry;
}
