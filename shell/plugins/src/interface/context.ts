import type {
  CorePluginContext,
  IConversationsNamespace,
  IJobsWriteNamespace,
} from "../core/context";
import { createCorePluginContext } from "../core/context";
import type { IShell, IMCPTransport } from "../interfaces";
import {
  createEnqueueJobFn,
  createEnqueueBatchFn,
  createRegisterHandlerFn,
} from "../shared/job-helpers";
import type { Daemon } from "@brains/daemon-registry";
import type { UserPermissionLevel } from "@brains/templates";
import type { IAgentService } from "@brains/agent-service";
import type {
  MessageRole,
  ConversationMetadata,
} from "@brains/conversation-service";
import type { RegisteredApiRoute } from "../types/api-routes";
import type { IMessageBus } from "@brains/messaging-service";

/**
 * Permissions namespace for InterfacePluginContext
 * Provides permission checking for users
 */
export interface IPermissionsNamespace {
  /** Get permission level for a user on an interface */
  getUserLevel: (interfaceType: string, userId: string) => UserPermissionLevel;
}

/**
 * Daemons namespace for InterfacePluginContext
 * Provides daemon registration
 */
export interface IDaemonsNamespace {
  /** Register a daemon for this interface */
  register: (name: string, daemon: Daemon) => void;
}

/**
 * API Routes namespace for InterfacePluginContext
 * Provides access to plugin-declared API routes
 */
export interface IApiRoutesNamespace {
  /** Get all registered API routes from plugins */
  getRoutes: () => RegisteredApiRoute[];
  /** Get the message bus for handling route requests */
  getMessageBus: () => IMessageBus;
}

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

  /**
   * Permissions namespace for user permission checking
   * - `permissions.getUserLevel()` - Get permission level for a user on an interface
   */
  readonly permissions: IPermissionsNamespace;

  // ============================================================================
  // Daemon Management
  // ============================================================================

  /**
   * Daemons namespace for daemon registration
   * - `daemons.register()` - Register a daemon for this interface
   */
  readonly daemons: IDaemonsNamespace;

  // ============================================================================
  // Job Queue (extends base IJobsNamespace with plugin-scoped operations)
  // ============================================================================

  /** Extended jobs namespace with plugin-scoped write operations */
  readonly jobs: IJobsWriteNamespace;

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

  // ============================================================================
  // API Routes (Plugin-declared HTTP endpoints)
  // ============================================================================

  /**
   * API Routes namespace for webserver interfaces
   * - `apiRoutes.getRoutes()` - Get all registered API routes from plugins
   * - `apiRoutes.getMessageBus()` - Get message bus for route handling
   */
  readonly apiRoutes: IApiRoutesNamespace;
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

    // Permissions namespace
    permissions: {
      getUserLevel: (
        interfaceType: string,
        userId: string,
      ): UserPermissionLevel => {
        return permissionService.determineUserLevel(interfaceType, userId);
      },
    },

    // Job operations namespace - extends shell.jobs with plugin-scoped operations
    jobs: {
      ...shell.jobs,
      enqueue: createEnqueueJobFn(shell.getJobQueueService(), pluginId, false),
      enqueueBatch: createEnqueueBatchFn(shell.jobs, pluginId),
      registerHandler: createRegisterHandlerFn(
        shell.getJobQueueService(),
        pluginId,
      ),
    },

    // Daemons namespace
    daemons: {
      register: (name: string, daemon: Daemon): void => {
        // Ensure daemon name is unique by prefixing with plugin ID
        const daemonName = `${pluginId}:${name}`;
        shell.registerDaemon(daemonName, daemon, pluginId);
        coreContext.logger.debug(`Registered daemon: ${daemonName}`);
      },
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

    // API Routes namespace
    apiRoutes: {
      getRoutes: (): RegisteredApiRoute[] => {
        return shell.getPluginApiRoutes();
      },
      getMessageBus: (): IMessageBus => {
        return shell.getMessageBus();
      },
    },
  };
}
