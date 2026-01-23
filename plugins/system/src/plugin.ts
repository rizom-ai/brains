import { CorePlugin } from "@brains/plugins";
import type {
  PluginTool,
  BaseEntity,
  DefaultQueryResponse,
  SearchResult,
  IdentityBody,
  ProfileBody,
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
    if (!this.context) {
      throw new Error("Plugin not registered");
    }

    try {
      const searchOptions: Parameters<
        typeof this.context.entityService.search
      >[1] = {
        limit: options?.limit ?? this.config.searchLimit,
      };

      if (options?.types) {
        searchOptions.types = options.types;
      }
      if (options?.sortBy) {
        searchOptions.sortBy = options.sortBy;
      }

      const results = await this.context.entityService.search(
        query,
        searchOptions,
      );

      return results;
    } catch (error) {
      this.error(`Failed to search entities: ${query}`, { error });
      return [];
    }
  }

  /**
   * Query using AI-powered search
   */
  public async query(
    prompt: string,
    context?: Record<string, unknown>,
  ): Promise<DefaultQueryResponse> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }

    return this.context.ai.query(prompt, context);
  }

  /**
   * Get a specific entity by type and ID
   */
  public async getEntity(
    entityType: string,
    id: string,
  ): Promise<BaseEntity | null> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }

    try {
      const entity = await this.context.entityService.getEntity(entityType, id);
      return entity;
    } catch (error) {
      this.error(`Failed to get entity ${entityType}:${id}`, { error });
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
    if (!this.context) {
      throw new Error("Plugin not registered");
    }

    try {
      // Try direct ID lookup first
      const byId = await this.context.entityService.getEntity(
        entityType,
        identifier,
      );
      if (byId) return byId;

      // Try by slug
      const bySlug = await this.context.entityService.listEntities(entityType, {
        limit: 1,
        filter: { metadata: { slug: identifier } },
      });
      if (bySlug[0]) return bySlug[0];

      // Try by title
      const byTitle = await this.context.entityService.listEntities(
        entityType,
        {
          limit: 1,
          filter: { metadata: { title: identifier } },
        },
      );
      if (byTitle[0]) return byTitle[0];

      return null;
    } catch (error) {
      this.error(`Failed to find entity ${entityType}:${identifier}`, {
        error,
      });
      return null;
    }
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
    if (!this.context) {
      throw new Error("Plugin not registered");
    }

    try {
      const listOptions: {
        limit: number;
        filter?: { metadata?: Partial<Record<string, unknown>> };
      } = {
        limit: options?.limit ?? 20,
      };
      if (options?.filter) {
        listOptions.filter = options.filter as {
          metadata?: Partial<Record<string, unknown>>;
        };
      }
      return await this.context.entityService.listEntities(
        entityType,
        listOptions,
      );
    } catch (error) {
      this.error(`Failed to list entities of type ${entityType}`, { error });
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
    if (!this.context) {
      throw new Error("Plugin not registered");
    }

    try {
      if (batchId) {
        // Get specific batch status
        const batch = await this.context.jobs.getBatchStatus(batchId);
        return { batch };
      } else {
        // Get all active operations
        const activeJobs = await this.context.jobs.getActiveJobs(jobTypes);
        const activeBatches = await this.context.jobs.getActiveBatches();
        return { activeJobs, activeBatches };
      }
    } catch (error) {
      this.error("Failed to get job status", { error, batchId, jobTypes });
      throw error;
    }
  }

  /**
   * Get conversation details by ID
   */
  public async getConversation(
    conversationId: string,
  ): Promise<Conversation | null> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.conversations.get(conversationId);
  }

  /**
   * Get messages from a conversation
   */
  public async getMessages(
    conversationId: string,
    limit?: number,
  ): Promise<Message[]> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.conversations.getMessages(
      conversationId,
      limit ? { limit } : undefined,
    );
  }

  /**
   * Search conversations
   */
  public async searchConversations(query: string): Promise<Conversation[]> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.conversations.search(query);
  }

  /**
   * Get the brain's identity data
   */
  public getIdentityData(): IdentityBody {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.identity.get();
  }

  /**
   * Get the owner's profile data
   */
  public getProfileData(): ProfileBody {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.identity.getProfile();
  }

  /**
   * Get list of registered entity types
   */
  public getEntityTypes(): string[] {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.entityService.getEntityTypes();
  }

  /**
   * Get entity counts grouped by type
   */
  public async getEntityCounts(): Promise<
    Array<{ entityType: string; count: number }>
  > {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.entityService.getEntityCounts();
  }

  /**
   * Get app metadata (model and version)
   */
  public getAppInfo(): Promise<AppInfo> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.identity.getAppInfo();
  }
}
