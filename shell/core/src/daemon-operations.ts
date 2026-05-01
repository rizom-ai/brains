import { getErrorMessage, type Logger, toError } from "@brains/utils";
import type {
  DaemonHealth,
  DaemonInfo,
  DaemonStatusInfo,
} from "@brains/plugins";

export async function startDaemonInfo(
  daemonInfo: DaemonInfo,
  logger: Logger,
): Promise<void> {
  if (daemonInfo.status === "running") {
    logger.warn(`Daemon already running: ${daemonInfo.name}`);
    return;
  }

  daemonInfo.status = "starting";
  delete daemonInfo.error;

  try {
    await daemonInfo.daemon.start();
    daemonInfo.status = "running";
    daemonInfo.startedAt = new Date();
    logger.debug(`Daemon started successfully: ${daemonInfo.name}`);
  } catch (error) {
    daemonInfo.status = "error";
    daemonInfo.error = toError(error);
    logger.warn(
      `Daemon ${daemonInfo.name} failed to start: ${getErrorMessage(error)}`,
    );
    throw error;
  }
}

export async function stopDaemonInfo(
  daemonInfo: DaemonInfo,
  logger: Logger,
): Promise<void> {
  if (daemonInfo.status === "stopped") {
    logger.warn(`Daemon already stopped: ${daemonInfo.name}`);
    return;
  }

  daemonInfo.status = "stopping";

  try {
    await daemonInfo.daemon.stop();
    daemonInfo.status = "stopped";
    daemonInfo.stoppedAt = new Date();
    logger.debug(`Daemon stopped successfully: ${daemonInfo.name}`);
  } catch (error) {
    daemonInfo.status = "error";
    daemonInfo.error = toError(error);
    logger.error(`Failed to stop daemon: ${daemonInfo.name}`, error);
    throw error;
  }
}

export async function checkDaemonInfoHealth(
  daemonInfo: DaemonInfo,
): Promise<DaemonHealth | undefined> {
  if (!daemonInfo.daemon.healthCheck) {
    return undefined;
  }

  try {
    const health = await daemonInfo.daemon.healthCheck();
    daemonInfo.health = health;
    return health;
  } catch (error) {
    const errorHealth: DaemonHealth = {
      status: "error",
      message: getErrorMessage(error),
      lastCheck: new Date(),
    };
    daemonInfo.health = errorHealth;
    return errorHealth;
  }
}

export function getDaemonStatusInfo(daemonInfo: DaemonInfo): DaemonStatusInfo {
  return {
    name: daemonInfo.name,
    pluginId: daemonInfo.pluginId,
    status: daemonInfo.status,
    health: daemonInfo.health,
  };
}
