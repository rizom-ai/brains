import type { RuntimeAppInfo } from "../interfaces";
import type { DaemonHealth } from "../manager/daemon-types";
import type { AppInfo } from "../contracts/app-info";

function toPublicDaemonHealth(
  health: DaemonHealth | undefined,
): AppInfo["daemons"][number]["health"] {
  if (!health) return undefined;

  return {
    status: health.status,
    message: health.message,
    lastCheck: health.lastCheck?.toISOString(),
    details: health.details,
  };
}

export function toPublicAppInfo(appInfo: RuntimeAppInfo): AppInfo {
  return {
    model: appInfo.model,
    version: appInfo.version,
    uptime: appInfo.uptime,
    entities: appInfo.entities,
    embeddings: appInfo.embeddings,
    ai: appInfo.ai,
    daemons: appInfo.daemons.map((daemon) => ({
      name: daemon.name,
      pluginId: daemon.pluginId,
      status: daemon.status,
      health: toPublicDaemonHealth(daemon.health),
    })),
    endpoints: appInfo.endpoints,
    interactions: appInfo.interactions ?? [],
  };
}
