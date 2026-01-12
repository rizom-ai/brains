import type {
  CorePluginContext,
  IConversationsNamespace,
} from "../core/context";
import { createCorePluginContext } from "../core/context";
import type { IShell, IMCPTransport } from "../interfaces";
import { createEnqueueJobFn, type EnqueueJobFn } from "../shared/job-helpers";
import type { Daemon } from "@brains/daemon-registry";
import type { UserPermissionLevel } from "@brains/permission-service";
import type {
  JobHandler,
  BatchOperation,
  JobOptions,
  IJobsNamespace,
} from "@brains/job-queue";
import { createId } from "@brains/utils";
import type { IAgentService } from "@brains/agent-service";
import type {
  MessageRole,
  ConversationMetadata,
} from "@brains/conversation-service";

/**
 * Extended conversations namespace for InterfacePluginContext
 * Adds write operations to the read-only base
 */
export interface IInterfaceConversationsNamespace
  extends IConversationsNamespace {
  /** Start a new conversation */
  start: (
    conversationId: string,
    interfaceType: string,
    channelId: string,
    metadata: ConversationMetadata,
  ) => Promise<string>;

  /** Add a message to a conversation */
  addMessage: (
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
}

/**
 * Context interface for interface plugins
 * Extends CorePluginContext with daemon support, job creation, and conversation management
 *
 * ## Method Naming Conventions
 * - Properties: Direct access to services (e.g., `mcpTransport`, `agentService`)
 * - `get*`: Retrieve data (e.g., `getUserPermissionLevel`)
 * - `register*`: Register handlers/daemons (e.g., `registerDaemon`, `registerJobHandler`)
 * - Action verbs: Operations with side effects (e.g., `enqueueJob`, `addMessage`)
 */
export interface InterfacePluginContext extends CorePluginContext {
  // ============================================================================
  // Services
  // ============================================================================

  /** MCP transport for tool execution */
  readonly mcpTransport: IMCPTransport;

  /** Agent service for AI-powered interaction */
  readonly agentService: IAgentService;

  // ============================================================================
  // Permissions
  // ============================================================================

  /** Get permission level for a user on an interface */
  getUserPermissionLevel: (
    interfaceType: string,
    userId: string,
  ) => UserPermissionLevel;

  // ============================================================================
  // Daemon Management
  // ============================================================================

  /** Register a daemon for this interface */
  registerDaemon: (name: string, daemon: Daemon) => void;

  // ============================================================================
  // Job Queue (extends base IJobsNamespace with plugin-scoped operations)
  // ============================================================================

  /** Extended jobs namespace with plugin-scoped write operations */
  readonly jobs: Omit<IJobsNamespace, "enqueueBatch"> & {
    /**
     * Enqueue a job for background processing
     * Interface plugins should pass null for toolContext
     */
    enqueue: EnqueueJobFn;

    /** Enqueue multiple operations as a batch (simplified - batchId generated internally) */
    enqueueBatch: (
      operations: BatchOperation[],
      options?: JobOptions,
    ) => Promise<string>;

    /** Register a handler for a job type (auto-scoped with plugin ID) */
    registerHandler: <T = unknown, R = unknown>(
      type: string,
      handler: JobHandler<string, T, R>,
    ) => void;
  };

  // ============================================================================
  // Conversation Management (Read + Write Operations)
  // ============================================================================

  /**
   * Extended conversations namespace with write operations
   * - `conversations.get()` - Get a conversation by ID (from Core)
   * - `conversations.search()` - Search conversations by query (from Core)
   * - `conversations.getMessages()` - Get messages from a conversation (from Core)
   * - `conversations.start()` - Start a new conversation
   * - `conversations.addMessage()` - Add a message to a conversation
   */
  readonly conversations: IInterfaceConversationsNamespace;
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

    // Job operations namespace - extends shell.jobs with plugin-scoped operations
    jobs: {
      // Pass through base operations from shell
      ...shell.jobs,

      // Plugin-scoped enqueue without auto-scoping (callers must be explicit)
      enqueue: createEnqueueJobFn(shell.getJobQueueService(), pluginId, false),

      // Plugin-scoped batch enqueue (generates batchId internally)
      enqueueBatch: async (
        operations: BatchOperation[],
        options?: JobOptions,
      ): Promise<string> => {
        const batchId = createId();
        // Add plugin scope to operation types unless already scoped
        const scopedOperations = operations.map((op) => ({
          ...op,
          type: op.type.includes(":") ? op.type : `${pluginId}:${op.type}`,
        }));
        const jobOptions: JobOptions = {
          ...options,
          source: pluginId,
          rootJobId: batchId,
          metadata: {
            ...options?.metadata,
            operationType: "batch_processing" as const,
            pluginId,
          },
        };
        await shell.jobs.enqueueBatch(
          scopedOperations,
          jobOptions,
          batchId,
          pluginId,
        );
        return batchId;
      },

      // Plugin-scoped handler registration
      registerHandler: <T = unknown, R = unknown>(
        type: string,
        handler: JobHandler<string, T, R>,
      ): void => {
        const jobQueueService = shell.getJobQueueService();
        const scopedType = `${pluginId}:${type}`;
        jobQueueService.registerHandler(scopedType, handler, pluginId);
      },
    },

    // Daemon support
    registerDaemon: (name: string, daemon: Daemon): void => {
      // Ensure daemon name is unique by prefixing with plugin ID
      const daemonName = `${pluginId}:${name}`;
      shell.registerDaemon(daemonName, daemon, pluginId);
      coreContext.logger.debug(`Registered daemon: ${daemonName}`);
    },

    // Extended conversations namespace (read + write operations)
    conversations: {
      // Include read operations from core
      ...coreContext.conversations,

      // Add write operations
      start: async (
        conversationId: string,
        interfaceType: string,
        channelId: string,
        metadata: ConversationMetadata,
      ): Promise<string> => {
        const conversationService = shell.getConversationService();
        return conversationService.startConversation(
          conversationId,
          interfaceType,
          channelId,
          metadata,
        );
      },
      addMessage: async (
        conversationId: string,
        role: MessageRole,
        content: string,
        metadata?: Record<string, unknown>,
      ): Promise<void> => {
        const conversationService = shell.getConversationService();
        await conversationService.addMessage(
          conversationId,
          role,
          content,
          metadata,
        );
      },
    },
  };
}
