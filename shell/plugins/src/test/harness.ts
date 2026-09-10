import { runCleanups } from "../internal/cleanup";
import { readToolFailureCause } from "../internal/tool-diagnostics";
import { SdkError } from "@brains/contracts";
import { readServiceJobResult } from "../service/job-definition-runtime";
import {
  PluginResourceScope,
  createPluginScopedShell,
} from "../manager/plugin-resource-scope";
import type {
  Plugin,
  PluginCapabilities,
  PluginType,
  ToolResponse,
  ToolConfirmation,
  ToolContext,
} from "../interfaces";
import { z } from "@brains/utils/zod";
import {
  canExposeTool,
  type Tool,
  type toolSuccessSchema,
  type toolErrorSchema,
} from "@brains/mcp-service";

type ToolSuccess = z.output<typeof toolSuccessSchema>;
type ToolError = z.output<typeof toolErrorSchema>;
import type { Logger } from "@brains/utils/logger";
import {
  createSilentLogger,
  createMockProgressReporter,
} from "@brains/test-utils";
import { createRequester } from "../internal/requester";
import type { SubscriptionRequester } from "../contracts/subscription";
import type { Template } from "@brains/templates";
import type { MessageHandler } from "@brains/messaging-service";
import type {
  DataSource,
  IEntityService,
  IEntityRegistry,
} from "@brains/entity-service";
import type { AttachmentRegistrationNamespace } from "../service/attachment-registry";
import { createMockShell, type MockShell } from "./mock-shell";
import { createReactionContext } from "../service/reaction-context";
import { createJobEntityAccess } from "../job/job-entity-access";
import type { JobEntityAccess } from "../job/job-context-contract";
import type { EntityReactionContext } from "../entity/entity-definition-contract";
import {
  createServicePluginContext,
  type ServicePluginContext,
} from "../service/context";
import {
  createEntityPluginContext,
  type EntityPluginContext,
} from "../entity/context";

export interface HarnessOptions {
  logger?: Logger;
  logContext?: string;
  dataDir?: string;
  /** Bare domain for context.domain/siteUrl/previewUrl */
  domain?: string;
  /** Local runtime site URL for context.localSiteUrl */
  localSiteUrl?: string;
  /** Prefer local runtime URLs over public domain URLs */
  preferLocalUrls?: boolean;
  /** Optional composition-selected semantic profile kind */
  profileKind?: string;
  /** Broker endpoint supplied to service-plugin contexts in integration tests. */
  gitBrokerSocket?: string;
  /** Absolute broker-owned checkout supplied with that endpoint. */
  gitBrokerCheckout?: string;
  /** Shared conversation spaces the brain is in. */
  spaces?: string[];
}

/**
 * Unified test harness for all plugin types
 * Provides a simple way to test plugins with automatic type detection
 */
export class PluginTestHarness<TPlugin extends Plugin = Plugin> {
  private mockShell: MockShell;
  private plugin: TPlugin | undefined;
  private capabilities: PluginCapabilities | undefined;
  /** Every plugin installed since the last reset, so reset can shut them down. */
  private installedPlugins: Plugin[] = [];
  private readonly resourceScopes = new Map<Plugin, PluginResourceScope>();
  private readonly options: HarnessOptions;
  private readonly logger: Logger;

  constructor(options: HarnessOptions = {}) {
    this.options = options;
    const logger =
      options.logger ?? createSilentLogger(options.logContext ?? "plugin-test");
    this.logger = logger;
    const mockShellOptions: {
      logger: Logger;
      dataDir?: string;
      domain?: string;
      localSiteUrl?: string;
      preferLocalUrls?: boolean;
      profileKind?: string;
      gitBrokerSocket?: string;
      gitBrokerCheckout?: string;
      spaces?: string[];
    } = { logger };
    if (options.spaces !== undefined) {
      mockShellOptions.spaces = options.spaces;
    }
    if (options.dataDir !== undefined) {
      mockShellOptions.dataDir = options.dataDir;
    }
    if (options.domain !== undefined) {
      mockShellOptions.domain = options.domain;
    }
    if (options.localSiteUrl !== undefined) {
      mockShellOptions.localSiteUrl = options.localSiteUrl;
    }
    if (options.preferLocalUrls !== undefined) {
      mockShellOptions.preferLocalUrls = options.preferLocalUrls;
    }
    if (options.profileKind !== undefined) {
      mockShellOptions.profileKind = options.profileKind;
    }
    if (options.gitBrokerSocket !== undefined) {
      mockShellOptions.gitBrokerSocket = options.gitBrokerSocket;
    }
    if (options.gitBrokerCheckout !== undefined) {
      mockShellOptions.gitBrokerCheckout = options.gitBrokerCheckout;
    }
    this.mockShell = createMockShell(mockShellOptions);
  }

  /**
   * Install a plugin for testing
   * The plugin will create its own typed context from the mock shell
   */
  async installPlugin(plugin: TPlugin): Promise<PluginCapabilities> {
    if (this.installedPlugins.some((installed) => installed.id === plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already installed`);
    }
    // Update logger context based on plugin type if not explicitly set
    // If no custom logger was provided in options, create one with the plugin type context
    if (!this.options.logger && !this.options.logContext) {
      const pluginType = this.getPluginType(plugin);
      const context = `${pluginType}-plugin-test`;
      const mockShellOptions: {
        logger: Logger;
        dataDir?: string;
        domain?: string;
        localSiteUrl?: string;
        preferLocalUrls?: boolean;
        profileKind?: string;
        gitBrokerSocket?: string;
        gitBrokerCheckout?: string;
      } = {
        logger: createSilentLogger(context),
      };
      if (this.options.dataDir !== undefined) {
        mockShellOptions.dataDir = this.options.dataDir;
      }
      if (this.options.domain !== undefined) {
        mockShellOptions.domain = this.options.domain;
      }
      if (this.options.localSiteUrl !== undefined) {
        mockShellOptions.localSiteUrl = this.options.localSiteUrl;
      }
      if (this.options.preferLocalUrls !== undefined) {
        mockShellOptions.preferLocalUrls = this.options.preferLocalUrls;
      }
      if (this.options.profileKind !== undefined) {
        mockShellOptions.profileKind = this.options.profileKind;
      }
      if (this.options.gitBrokerSocket !== undefined) {
        mockShellOptions.gitBrokerSocket = this.options.gitBrokerSocket;
      }
      if (this.options.gitBrokerCheckout !== undefined) {
        mockShellOptions.gitBrokerCheckout = this.options.gitBrokerCheckout;
      }
      this.mockShell = createMockShell(mockShellOptions);
    }

    const shell = this.mockShell;
    const resources = new PluginResourceScope();
    resources.addFinalizer(() =>
      shell.getJobQueueService().unregisterPluginHandlers(plugin.id),
    );
    this.resourceScopes.set(plugin, resources);
    try {
      const capabilities = await plugin.register(
        createPluginScopedShell(shell, resources),
      );
      shell.addPlugin(plugin);
      this.plugin = plugin;
      this.capabilities = capabilities;
      this.installedPlugins.push(plugin);
      return capabilities;
    } catch (error) {
      try {
        await this.releasePlugin(plugin);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Plugin "${plugin.id}" registration and rollback failed`,
          { cause: cleanupError },
        );
      }
      throw error;
    }
  }

  /** Install one package atomically without disturbing previously installed packages. */
  async installPlugins(
    plugins: readonly TPlugin[],
  ): Promise<readonly { plugin: TPlugin; capabilities: PluginCapabilities }[]> {
    const previousPlugin = this.plugin;
    const previousCapabilities = this.capabilities;
    const installed: { plugin: TPlugin; capabilities: PluginCapabilities }[] =
      [];
    try {
      for (const plugin of plugins) {
        installed.push({
          plugin,
          capabilities: await this.installPlugin(plugin),
        });
      }
      return installed;
    } catch (error) {
      try {
        await runCleanups(
          installed.map(({ plugin }) => async (): Promise<void> => {
            const index = this.installedPlugins.indexOf(plugin);
            if (index >= 0) this.installedPlugins.splice(index, 1);
            this.mockShell.removePlugin(plugin.id);
            await this.releasePlugin(plugin);
          }),
        );
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Package installation and rollback failed",
          { cause: cleanupError },
        );
      } finally {
        this.plugin = previousPlugin;
        this.capabilities = previousCapabilities;
      }
      throw error;
    }
  }

  /** Finalize app-scoped registries and the installed plugin before sync. */
  async finalizeRegistration(): Promise<void> {
    if (!this.plugin) {
      throw new Error("No plugin installed. Call installPlugin() first.");
    }
    this.mockShell.getProfileKindRegistry().finalize();
    this.mockShell.getChannelRegistry().finalize();
    this.mockShell.getInboxRegistry().finalize();
    this.mockShell.getInboxFollowUpRegistry().finalize();
    for (const plugin of this.installedPlugins) {
      await plugin.finalizeRegistration?.();
    }
  }

  /**
   * Get the installed plugin for direct testing
   */
  getPlugin(): TPlugin {
    if (!this.plugin) {
      throw new Error("No plugin installed. Call installPlugin() first.");
    }
    return this.plugin;
  }

  /**
   * Get the plugin capabilities
   */
  getCapabilities(): PluginCapabilities {
    if (!this.capabilities) {
      throw new Error("No plugin installed. Call installPlugin() first.");
    }
    return this.capabilities;
  }

  /**
   * Get the entity service for creating/querying test entities
   */
  getEntityService(): IEntityService {
    return this.mockShell.getEntityService();
  }

  /**
   * Get the underlying mock shell for direct access in tests
   */
  getMockShell(): MockShell {
    return this.mockShell;
  }

  /**
   * Get the entity registry for registering entity types in tests
   */
  getEntityRegistry(): IEntityRegistry {
    return this.mockShell.getEntityRegistry();
  }

  /**
   * Create a ServicePluginContext for testing tools/handlers/datasources in isolation
   */
  getServiceContext(pluginId: string): ServicePluginContext {
    return createServicePluginContext(this.mockShell, pluginId);
  }

  /** Native entity access for tests of setup helpers and native job handlers. */
  getJobEntityAccess(
    pluginId: string,
    entityTypes?: Iterable<string>,
  ): JobEntityAccess {
    return createJobEntityAccess(
      this.getEntityService(),
      new Set(entityTypes ?? this.getEntityService().getEntityTypes()),
      pluginId,
    );
  }

  /**
   * The context a declared check, inbox action or tool runs in.
   *
   * A declaration is a plain object, so the only thing standing between a
   * test and running one is this. Entity types default to whatever the
   * harness has registered, which is what the package under test declared.
   */
  getReactionContext(
    pluginId: string,
    entityTypes?: Iterable<string>,
  ): EntityReactionContext {
    return createReactionContext({
      context: this.getServiceContext(pluginId),
      // Notes belong to the package, and a plugin id from a package is
      // `${packageName}:${localId}` — so the package is its first segment.
      packageName: pluginId.includes(":")
        ? pluginId.slice(0, pluginId.lastIndexOf(":"))
        : pluginId,
      entities: this.getJobEntityAccess(pluginId, entityTypes),
      logger: this.logger,
    });
  }

  /**
   * Create an EntityPluginContext for testing entity plugin handlers/datasources
   */
  getEntityContext(pluginId: string): EntityPluginContext {
    return createEntityPluginContext(this.mockShell, pluginId);
  }

  /**
   * Override the agent service (for interface plugin tests that mock AI responses)
   */
  setAgentService(
    agentService: Parameters<MockShell["setAgentService"]>[0],
  ): void {
    this.mockShell.setAgentService(agentService);
  }

  /**
   * Get the permission service for reading permission levels
   */
  getPermissionService(): ReturnType<MockShell["getPermissionService"]> {
    return this.mockShell.getPermissionService();
  }

  /**
   * Override the permission service (for interface tests that need custom permission config)
   */
  setPermissionService(
    service: ReturnType<MockShell["getPermissionService"]>,
  ): void {
    this.mockShell.getPermissionService = (): ReturnType<
      MockShell["getPermissionService"]
    > => service;
  }

  /**
   * Bulk-add test entities (registers entity types automatically)
   */
  addEntities(
    entities: Array<{
      id: string;
      entityType: string;
      content: string;
      metadata: Record<string, unknown>;
      contentHash?: string;
      visibility?: "public" | "shared" | "restricted";
      created?: string;
      updated?: string;
    }>,
  ): void {
    this.mockShell.addEntities(
      entities.map((e) => ({
        contentHash: "test",
        visibility: "public",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ...e,
      })),
    );
  }

  /**
   * Register a template for testing
   */
  registerTemplate(name: string, template: Template): void {
    this.mockShell.registerTemplates({ [name]: template });
  }

  /**
   * Get registered templates
   */
  getTemplates(): Map<string, Template> {
    return this.mockShell.getTemplates();
  }

  /**
   * Get the attachment registry
   */
  getAttachments(): AttachmentRegistrationNamespace {
    return this.mockShell.getAttachmentRegistry();
  }

  /**
   * Register a DataSource for testing
   */
  registerDataSource(dataSource: DataSource): void {
    // Just register the DataSource directly - the register method handles prefixing
    this.mockShell.getDataSourceRegistry().register(dataSource);
  }

  /**
   * Get registered DataSources
   */
  getDataSources(): Map<string, DataSource> {
    const registry = this.mockShell.getDataSourceRegistry();
    const dataSources = new Map<string, DataSource>();

    // Get all DataSource IDs and their corresponding DataSources
    registry.getIds().forEach((id) => {
      const dataSource = registry.get(id);
      if (dataSource) {
        dataSources.set(id, dataSource);
      }
    });

    return dataSources;
  }

  /**
   * Send a message through the message bus
   */
  async sendMessage<T = unknown, R = unknown>(
    channel: string,
    payload: T,
    source = "test",
    broadcast?: boolean,
  ): Promise<R | undefined> {
    const response = await this.mockShell.getMessageBus().send<T, R>({
      type: channel,
      payload,
      sender: source,
      ...(broadcast !== undefined && { broadcast }),
    });
    if ("data" in response) {
      return response.data;
    }
    return undefined;
  }

  /** The same schema-bearing request path an author callback receives. */
  readonly request: SubscriptionRequester = createRequester((message) =>
    this.mockShell.getMessageBus().send({ ...message, sender: "test" }),
  );

  /** Execute one registered job attempt, without a worker or retry loop. */
  async runJob(type: string, input: unknown): Promise<unknown> {
    const handler = this.mockShell.getJobQueueService().getHandler(type);
    if (!handler) throw new Error(`No job handler registered for "${type}"`);
    const parsed = handler.validateAndParse(input);
    if (parsed === null)
      throw new SdkError("invalid_input", {
        message: `Invalid input for job "${type}"`,
      });
    const result = await handler.process(
      parsed,
      "test-job",
      createMockProgressReporter(),
      new AbortController().signal,
    );
    return readServiceJobResult(handler, result);
  }

  /**
   * Subscribe to messages
   */
  subscribe<T = unknown, R = unknown>(
    channel: string,
    handler: MessageHandler<T, R>,
  ): () => void {
    return this.mockShell.getMessageBus().subscribe(channel, handler);
  }

  /**
   * Get the plugin's session ID (for InterfacePlugin)
   */
  getSessionId(): string {
    const plugin = this.getPlugin();
    if ("sessionId" in plugin && typeof plugin.sessionId === "string") {
      return plugin.sessionId;
    }
    throw new Error("Plugin does not have a sessionId property");
  }

  /**
   * Execute a tool by name
   * @param toolName - Full tool name (e.g., "system_search")
   * @param input - Tool input parameters
   * @param context - Optional tool context override
   * @returns Tool result with success/error status
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown> = {},
    context?: {
      interfaceType?: string;
      actor?: ToolContext["actor"];
      conversationId?: string;
      channelId?: string;
      userPermissionLevel?: "admin" | "trusted" | "public";
    },
  ): Promise<ToolResponse> {
    if (!this.capabilities) {
      throw new Error("No plugin installed. Call installPlugin() first.");
    }

    const tool = this.capabilities.tools.find((t) => t.name === toolName);
    if (!tool) {
      const availableTools = this.capabilities.tools.map((t) => t.name);
      throw new Error(
        `Tool not found: ${toolName}. Available tools: ${availableTools.join(", ")}`,
      );
    }

    // Default test context to anchor so existing plugin tests can see
    // entities across all visibility levels unless they opt into a lower scope.
    const toolContext: ToolContext = {
      interfaceType: context?.interfaceType ?? "test",
      actor: context?.actor ?? {
        kind: "service",
        serviceId: "plugin-test-harness",
      },
      userPermissionLevel: context?.userPermissionLevel ?? "admin",
    };
    if (context?.conversationId) {
      toolContext.conversationId = context.conversationId;
    }
    if (context?.channelId) {
      toolContext.channelId = context.channelId;
    }

    return this.callTool(tool, input, toolContext);
  }

  /** Original thrown value for this exact response, available only to tests. */
  getToolFailureCause(response: ToolResponse): unknown {
    return readToolFailureCause(response);
  }

  /** Apply the production tool permission rule before entering its handler. */
  async callTool(
    tool: Tool,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResponse> {
    if (!canExposeTool(context.userPermissionLevel ?? "public", tool)) {
      return {
        success: false,
        error: `Permission denied for tool "${tool.name}"`,
        code: "permission_denied",
      };
    }
    return tool.handler(input, context);
  }

  /**
   * Reset the harness: shut every installed plugin down, then start from a
   * fresh MockShell.
   *
   * A plugin's shutdown is what clears module-level state it registered —
   * the auth-service plugin's active-service singleton, for one — and bun
   * runs every test file in one process, so a plugin left running leaks
   * into the next file. Always await reset: admission is stopped and in-flight
   * callbacks drained before plugin resources are torn down, as in production.
   */
  async reset(): Promise<void> {
    const plugins = this.installedPlugins.splice(0);
    this.plugin = undefined;
    this.capabilities = undefined;
    // Create a fresh MockShell
    this.mockShell = createMockShell({
      ...this.options,
      logger: this.mockShell.getLogger(),
    });
    await runCleanups(
      plugins.map(
        (plugin): (() => Promise<void>) =>
          (): Promise<void> =>
            this.releasePlugin(plugin),
      ),
    );
  }

  private async releasePlugin(plugin: Plugin): Promise<void> {
    const resources = this.resourceScopes.get(plugin);
    this.resourceScopes.delete(plugin);
    await runCleanups([
      async (): Promise<void> => {
        await plugin.shutdown?.();
      },
      async (): Promise<void> => {
        await resources?.close();
      },
    ]);
  }

  /**
   * Detect plugin type from plugin instance
   */
  private getPluginType(plugin: Plugin): PluginType {
    return plugin.type;
  }
}

/**
 * Create a test harness for any plugin type
 */
export function createPluginHarness<T extends Plugin = Plugin>(
  options?: HarnessOptions,
): PluginTestHarness<T> {
  return new PluginTestHarness<T>({
    logContext: "plugin-test",
    ...options,
  });
}

// ── Test assertion helpers ──

/**
 * Assert a tool result is the success variant.
 * Throws if not — narrows the type for subsequent access.
 */
export function expectSuccess(
  result: ToolResponse,
): asserts result is ToolSuccess {
  if (!("success" in result) || !result.success) {
    throw new Error(`Expected tool success but got: ${JSON.stringify(result)}`);
  }
}

/**
 * Assert a tool result is the error variant.
 * Throws if not — narrows the type for subsequent access.
 */
export function expectError(result: ToolResponse): asserts result is ToolError {
  if (!("success" in result) || result.success !== false) {
    throw new Error(`Expected tool error but got: ${JSON.stringify(result)}`);
  }
}

/**
 * Assert a tool result is a confirmation request.
 * Throws if not — narrows the type for subsequent access.
 */
export function expectConfirmation(
  result: ToolResponse,
): asserts result is ToolConfirmation {
  if (!("needsConfirmation" in result)) {
    throw new Error(`Expected confirmation but got: ${JSON.stringify(result)}`);
  }
}

/**
 * The arguments a confirmation carries back, as a record.
 *
 * `ToolConfirmation.args` is `unknown` — whatever the tool was called with —
 * and tests re-submit it to complete the flow. Parsing is what proves the
 * confirmation carried the arguments through; asserting a record onto it would
 * keep passing against a confirmation that carried nothing at all.
 */
export function confirmationArgs(
  confirmation: ToolConfirmation,
): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(confirmation.args);
}
