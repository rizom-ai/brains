import { CorePlugin, findEntityByIdentifier } from "@brains/plugins";
import type {
  PluginTool,
  BaseEntity,
  DefaultQueryResponse,
  SearchResult,
  BrainCharacter,
  AnchorProfile,
  AppInfo,
  BatchJobStatus,
  Batch,
  JobInfo,
  Conversation,
  Message,
  CorePluginContext,
} from "@brains/plugins";
import {
  systemConfigSchema,
  type SystemConfig,
  type SearchOptions,
} from "./schemas";
import { createSystemTools } from "./tools";
import packageJson from "../package.json";

/**
 * System Plugin - Provides core system operations
 *
 * This plugin provides the fundamental operations for the brain system:
 * - Search: Direct entity search
 * - Query: AI-powered knowledge base query
 * - Get: Retrieve specific entities by ID
 * - Job Status: Monitor background operations
 */
export class SystemPlugin extends CorePlugin<SystemConfig> {
  // After validation with defaults, config is complete
  declare protected config: SystemConfig;

  constructor(config: Partial<SystemConfig> = {}) {
    super("system", packageJson, config, systemConfigSchema);
  }

  /**
   * Register dashboard widgets after all plugins are ready
   *
   * We wait for system:plugins:ready to ensure the Dashboard plugin
   * has already subscribed to dashboard:register-widget messages.
   * This solves the timing issue where System plugin initializes
   * before Dashboard and widget messages would be lost.
   */
  protected override async onRegister(
    context: CorePluginContext,
  ): Promise<void> {
    // Subscribe to system:plugins:ready to register widgets AFTER Dashboard is listening
    context.messaging.subscribe("system:plugins:ready", async () => {
      this.logger.info(
        "system:plugins:ready received, registering dashboard widgets",
      );
      // Register entity stats widget
      await context.messaging.send("dashboard:register-widget", {
        id: "entity-stats",
        pluginId: this.id,
        title: "Entity Statistics",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => {
          const counts = await this.getEntityCounts();
          return {
            stats: Object.fromEntries(
              counts.map(({ entityType, count }) => [entityType, count]),
            ),
          };
        },
      });

      // Register job status widget
      await context.messaging.send("dashboard:register-widget", {
        id: "job-status",
        pluginId: this.id,
        title: "Active Jobs",
        section: "secondary",
        priority: 20,
        rendererName: "ListWidget",
        dataProvider: async () => {
          const { activeJobs, activeBatches } = await this.getJobStatus();
          return {
            jobs: activeJobs ?? [],
            batches: activeBatches ?? [],
          };
        },
      });

      // Register identity widget
      await context.messaging.send("dashboard:register-widget", {
        id: "identity",
        pluginId: this.id,
        title: "Brain Identity",
        section: "sidebar",
        priority: 5,
        rendererName: "CustomWidget",
        dataProvider: async () => ({
          identity: this.getIdentityData(),
          profile: this.getProfileData(),
        }),
      });

      this.logger.debug("System plugin registered dashboard widgets");
      return { success: true };
    });
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return createSystemTools(this, this.id);
  }

  /**
   * Search entities using entity service
   */
  public async searchEntities(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const context = this.getContext();

    try {
      return await context.entityService.search(query, {
        limit: options?.limit ?? this.config.searchLimit,
        ...(options?.types && { types: options.types }),
        ...(options?.sortBy && { sortBy: options.sortBy }),
      });
    } catch (error) {
      this.logger.error(`Failed to search entities: ${query}`, { error });
      return [];
    }
  }

  /**
   * Query using AI-powered search
   */
  public async query(
    prompt: string,
    queryContext?: Record<string, unknown>,
  ): Promise<DefaultQueryResponse> {
    return this.getContext().ai.query(prompt, queryContext);
  }

  /**
   * Get a specific entity by type and ID
   */
  public async getEntity(
    entityType: string,
    id: string,
  ): Promise<BaseEntity | null> {
    const context = this.getContext();

    try {
      return await context.entityService.getEntity(entityType, id);
    } catch (error) {
      this.logger.error(`Failed to get entity ${entityType}:${id}`, { error });
      return null;
    }
  }

  /**
   * Find entity by ID, slug, or title
   */
  public async findEntity(
    entityType: string,
    identifier: string,
  ): Promise<BaseEntity | null> {
    return findEntityByIdentifier(
      this.getContext().entityService,
      entityType,
      identifier,
      this.logger,
    );
  }

  /**
   * List entities by type with optional filters
   */
  public async listEntities(
    entityType: string,
    options?: {
      limit?: number;
      filter?: Record<string, unknown>;
    },
  ): Promise<BaseEntity[]> {
    const context = this.getContext();

    try {
      return await context.entityService.listEntities(entityType, {
        limit: options?.limit ?? 20,
        ...(options?.filter && {
          filter: options.filter as {
            metadata?: Partial<Record<string, unknown>>;
          },
        }),
      });
    } catch (error) {
      this.logger.error(`Failed to list entities of type ${entityType}`, {
        error,
      });
      return [];
    }
  }

  /**
   * Get job status information
   */
  public async getJobStatus(
    batchId?: string,
    jobTypes?: string[],
  ): Promise<{
    batch?: BatchJobStatus | null;
    activeJobs?: JobInfo[];
    activeBatches?: Batch[];
  }> {
    const context = this.getContext();

    try {
      if (batchId) {
        const batch = await context.jobs.getBatchStatus(batchId);
        return { batch };
      } else {
        const activeJobs = await context.jobs.getActiveJobs(jobTypes);
        const activeBatches = await context.jobs.getActiveBatches();
        return { activeJobs, activeBatches };
      }
    } catch (error) {
      this.logger.error("Failed to get job status", {
        error,
        batchId,
        jobTypes,
      });
      throw error;
    }
  }

  /**
   * Get conversation details by ID
   */
  public async getConversation(
    conversationId: string,
  ): Promise<Conversation | null> {
    return this.getContext().conversations.get(conversationId);
  }

  /**
   * Get messages from a conversation
   */
  public async getMessages(
    conversationId: string,
    limit?: number,
  ): Promise<Message[]> {
    return this.getContext().conversations.getMessages(
      conversationId,
      limit ? { limit } : undefined,
    );
  }

  /**
   * Search conversations
   */
  public async searchConversations(query: string): Promise<Conversation[]> {
    return this.getContext().conversations.search(query);
  }

  /**
   * Get the brain's identity data
   */
  public getIdentityData(): BrainCharacter {
    return this.getContext().identity.get();
  }

  /**
   * Get the owner's profile data
   */
  public getProfileData(): AnchorProfile {
    return this.getContext().identity.getProfile();
  }

  /**
   * Get list of registered entity types
   */
  public getEntityTypes(): string[] {
    return this.getContext().entityService.getEntityTypes();
  }

  /**
   * Get entity counts grouped by type
   */
  public async getEntityCounts(): Promise<
    Array<{ entityType: string; count: number }>
  > {
    return this.getContext().entityService.getEntityCounts();
  }

  /**
   * Get app metadata (model and version)
   */
  public getAppInfo(): Promise<AppInfo> {
    return this.getContext().identity.getAppInfo();
  }
}

export function systemPlugin(config?: Partial<SystemConfig>): SystemPlugin {
  return new SystemPlugin(config);
}
