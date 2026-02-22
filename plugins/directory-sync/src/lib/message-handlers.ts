import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { DirectorySync } from "./directory-sync";

interface ConfigureOptions {
  syncPath: string;
}

/**
 * Register message-bus handlers for cross-plugin communication:
 *   - entity:export:request
 *   - entity:import:request
 *   - sync:status:request
 *   - sync:configure:request
 */
export function registerMessageHandlers(
  context: ServicePluginContext,
  getDirectorySync: () => DirectorySync,
  configure: (options: ConfigureOptions) => Promise<void>,
  logger: Logger,
): void {
  const { subscribe } = context.messaging;

  subscribe<{ entityTypes?: string[] }>(
    "entity:export:request",
    async (message) => {
      try {
        const ds = getDirectorySync();
        const result = await ds.exportEntities(message.payload.entityTypes);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Export failed",
        };
      }
    },
  );

  subscribe<{ paths?: string[] }>("entity:import:request", async (message) => {
    try {
      const ds = getDirectorySync();
      const result = await ds.importEntities(message.payload.paths);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Import failed",
      };
    }
  });

  subscribe("sync:status:request", async () => {
    try {
      const ds = getDirectorySync();
      const status = await ds.getStatus();
      return {
        success: true,
        data: {
          syncPath: status.syncPath,
          isInitialized: status.exists,
          watchEnabled: status.watching,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Status check failed",
      };
    }
  });

  subscribe<{ syncPath: string }>("sync:configure:request", async (message) => {
    try {
      await configure({ syncPath: message.payload.syncPath });
      return {
        success: true,
        data: {
          syncPath: message.payload.syncPath,
          configured: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Configuration failed",
      };
    }
  });

  logger.debug("Registered message handlers");
}
