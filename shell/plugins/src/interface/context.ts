import type {
  BasePluginContext,
  IConversationsNamespace,
} from "../base/context";
import { createBasePluginContext } from "../base/context";
import type {
  IShell,
  IMCPTransport,
  PluginRegistrationContext,
} from "../interfaces";
import type { Daemon } from "../manager/daemon-types";
import type {
  PermissionLookupContext,
  UserPermissionLevel,
} from "@brains/templates";
import type { AgentNamespace } from "../contracts/agent";
import { createPublicAgentNamespace } from "../base/public-agent-service";
import type {
  StartConversationRequest,
  AddConversationMessageRequest,
} from "@brains/conversation-service";
import type { RegisteredApiRoute } from "../types/api-routes";
import type { RegisteredWebRoute } from "../types/web-routes";
import type { IMessageBus } from "@brains/messaging-service";
import type { ToolInfo } from "@brains/mcp-service";

/**
 * Permissions namespace for InterfacePluginContext
 * Provides permission checking for users
 */
export interface IPermissionsNamespace {
  /** Get permission level for a user on an interface */
  getUserLevel: (
    interfaceType: string,
    userId: string,
    context?: PermissionLookupContext,
  ) => UserPermissionLevel;
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
 * Tools namespace for InterfacePluginContext
 * Provides access to registered tools filtered by permission level
 */
export interface IToolsNamespace {
  /** List tools available at a given permission level */
  listForPermissionLevel: (level: UserPermissionLevel) => ToolInfo[];
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

export interface IWebRoutesNamespace {
  /** Get all registered web routes from plugins */
  getRoutes: () => RegisteredWebRoute[];
}

export interface IPluginsNamespace {
  /** Check whether a plugin/interface is registered on the shell */
  has: (pluginId: string) => boolean;
}

/**
 * Extended conversations namespace for InterfacePluginContext
 * Adds write operations to the read-only base
 */
export interface IInterfaceConversationsNamespace extends IConversationsNamespace {
  /** Start a new conversation */
  start: (request: StartConversationRequest) => Promise<string>;

  /** Add a message to a conversation */
  addMessage: (request: AddConversationMessageRequest) => Promise<void>;
}

/**
 * Context interface for interface plugins
 * Extends BasePluginContext with daemon support, job creation, and conversation management
 *
 * ## Method Naming Conventions
 * - Properties: Direct access to public namespaces (e.g., `mcpTransport`, `agent`)
 * - `get*`: Retrieve data (e.g., `getUserPermissionLevel`)
 * - `register*`: Register handlers/daemons (e.g., `registerDaemon`, `registerJobHandler`)
 * - Action verbs: Operations with side effects (e.g., `enqueueJob`, `addMessage`)
 */
export interface InterfacePluginContext extends BasePluginContext {
  // ============================================================================
  // Services
  // ============================================================================

  /** MCP transport for tool execution */
  readonly mcpTransport: IMCPTransport;

  /** Public agent namespace for AI-powered interaction */
  readonly agent: AgentNamespace;

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
  // Tools (Registered MCP tools)
  // ============================================================================

  /**
   * Tools namespace for accessing registered tools
   * - `tools.listForPermissionLevel()` - List tools available at a given permission level
   */
  readonly tools: IToolsNamespace;

  // ============================================================================
  // API Routes (Plugin-declared HTTP endpoints)
  // ============================================================================

  /**
   * API Routes namespace for webserver interfaces
   * - `apiRoutes.getRoutes()` - Get all registered API routes from plugins
   * - `apiRoutes.getMessageBus()` - Get message bus for route handling
   */
  readonly apiRoutes: IApiRoutesNamespace;

  /** Plugin-contributed web routes for the shared HTTP surface */
  readonly webRoutes: IWebRoutesNamespace;

  /** Plugin registry visibility for interface coordination */
  readonly plugins: IPluginsNamespace;
}

/**
 * Create an InterfacePluginContext for a plugin
 */
export function createInterfacePluginContext(
  shell: IShell,
  pluginId: string,
  registrationContext?: PluginRegistrationContext,
): InterfacePluginContext {
  const baseContext = createBasePluginContext(
    shell,
    pluginId,
    registrationContext,
  );

  // Get interface-specific components
  const mcpTransport = shell.getMCPService();
  const permissionService = shell.getPermissionService();
  const agent = createPublicAgentNamespace(shell.getAgentService());

  return {
    ...baseContext,

    mcpTransport,

    agent,

    permissions: {
      getUserLevel: (
        interfaceType: string,
        userId: string,
        context?: PermissionLookupContext,
      ): UserPermissionLevel => {
        return permissionService.determineUserLevel(
          interfaceType,
          userId,
          context,
        );
      },
    },

    // Daemons namespace
    daemons: {
      register: (name: string, daemon: Daemon): void => {
        // Ensure daemon name is unique by prefixing with plugin ID
        const daemonName = `${pluginId}:${name}`;
        shell.registerDaemon(daemonName, daemon, pluginId);
        baseContext.logger.debug(`Registered daemon: ${daemonName}`);
      },
    },

    conversations: {
      ...baseContext.conversations,

      start: async (request: StartConversationRequest): Promise<string> => {
        const conversationService = shell.getConversationService();
        return conversationService.startConversation(request);
      },
      addMessage: async (
        request: AddConversationMessageRequest,
      ): Promise<void> => {
        const conversationService = shell.getConversationService();
        await conversationService.addMessage(request);
      },
    },

    // Tools namespace
    tools: {
      listForPermissionLevel: (level: UserPermissionLevel): ToolInfo[] => {
        return shell.listToolsForPermissionLevel(level);
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

    webRoutes: {
      getRoutes: (): RegisteredWebRoute[] => {
        return shell.getPluginWebRoutes();
      },
    },

    plugins: {
      has: (candidatePluginId: string): boolean =>
        shell.hasPlugin(candidatePluginId),
    },
  };
}
