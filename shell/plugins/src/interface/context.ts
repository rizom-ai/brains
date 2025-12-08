import type { CorePluginContext } from "../core/context";
import { createCorePluginContext } from "../core/context";
import type { IShell, IMCPTransport } from "../interfaces";
import type { Daemon } from "@brains/daemon-registry";
import type { UserPermissionLevel } from "@brains/permission-service";
import type { JobHandler, BatchOperation, JobOptions } from "@brains/job-queue";
import { createId } from "@brains/utils";
import type { IAgentService } from "@brains/agent-service";

/**
 * Context interface for interface plugins
 * Extends CorePluginContext with daemon support and job creation
 */
export interface InterfacePluginContext extends CorePluginContext {
  // Permission checking
  getUserPermissionLevel: (
    interfaceType: string,
    userId: string,
  ) => UserPermissionLevel;

  // Daemon management
  registerDaemon: (name: string, daemon: Daemon) => void;

  // Job queue functionality (for automatic job tracking)
  enqueueJob: (
    type: string,
    data: unknown,
    options?: JobOptions,
  ) => Promise<string>;
  enqueueBatch: (
    operations: BatchOperation[],
    options?: JobOptions,
  ) => Promise<string>;
  registerJobHandler: <T = unknown, R = unknown>(
    type: string,
    handler: JobHandler<string, T, R>,
  ) => void;

  // MCP transport for interface plugins
  readonly mcpTransport: IMCPTransport;

  // Agent service for AI-powered interaction
  readonly agentService: IAgentService;
}

/**
 * Create an InterfacePluginContext for a plugin
 */
export function createInterfacePluginContext(
  shell: IShell,
  pluginId: string,
): InterfacePluginContext {
  // Start with core context
  const coreContext = createCorePluginContext(shell, pluginId);

  // Get interface-specific components
  const mcpTransport = shell.getMcpTransport();
  const permissionService = shell.getPermissionService();
  const agentService = shell.getAgentService();

  return {
    ...coreContext,

    // MCP transport
    mcpTransport,

    // Agent service
    agentService,

    // Permission checking
    getUserPermissionLevel: (
      interfaceType: string,
      userId: string,
    ): UserPermissionLevel => {
      return permissionService.determineUserLevel(interfaceType, userId);
    },

    // Job queue functionality
    enqueueJob: async (type, data, options): Promise<string> => {
      const jobQueueService = shell.getJobQueueService();
      const defaultOptions: JobOptions = {
        source: pluginId,
        // Only set rootJobId if explicitly provided (for batch children)
        // For standalone jobs, let JobQueueService default to the job's own ID
        ...(options?.rootJobId && { rootJobId: options.rootJobId }),
        metadata: {
          operationType: "data_processing" as const,
          pluginId,
          ...options?.metadata,
        },
        ...options,
      };
      // Callers must be explicit about job type scope
      return jobQueueService.enqueue(type, data, defaultOptions);
    },
    enqueueBatch: async (operations, options): Promise<string> => {
      const batchId = createId();
      // Add plugin scope to operation types unless already scoped
      const scopedOperations = operations.map((op) => ({
        ...op,
        type: op.type.includes(":") ? op.type : `${pluginId}:${op.type}`,
      }));
      const defaultOptions: JobOptions = {
        source: pluginId,
        rootJobId: batchId, // Use generated batch ID as rootJobId
        metadata: {
          operationType: "batch_processing" as const,
          pluginId,
          ...options?.metadata,
        },
        ...options,
      };
      return shell.enqueueBatch(
        scopedOperations,
        defaultOptions,
        batchId,
        pluginId,
      );
    },
    registerJobHandler: (type, handler): void => {
      const jobQueueService = shell.getJobQueueService();
      // Add plugin scope to the type for explicit registration
      const scopedType = `${pluginId}:${type}`;
      jobQueueService.registerHandler(scopedType, handler, pluginId);
    },

    // Daemon support
    registerDaemon: (name: string, daemon: Daemon): void => {
      // Ensure daemon name is unique by prefixing with plugin ID
      const daemonName = `${pluginId}:${name}`;
      shell.registerDaemon(daemonName, daemon, pluginId);
      coreContext.logger.debug(`Registered daemon: ${daemonName}`);
    },
  };
}
