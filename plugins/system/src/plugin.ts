import { CorePlugin } from "@brains/plugins";
import type {
  Command,
  PluginTool,
  BaseEntity,
  DefaultQueryResponse,
  SearchResult,
  IdentityBody,
  AppInfo,
} from "@brains/plugins";
import type { BatchJobStatus, Batch, JobInfo } from "@brains/job-queue";
import type { Conversation, Message } from "@brains/conversation-service";
import {
  systemConfigSchema,
  type SystemConfig,
  type SearchOptions,
} from "./schemas";
import { createSystemCommands } from "./commands";
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
   * Get plugin commands
   */
  protected override async getCommands(): Promise<Command[]> {
    return createSystemCommands(this, this.id);
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

    return this.context.query(prompt, context);
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
        const batch = await this.context.getBatchStatus(batchId);
        return { batch };
      } else {
        // Get all active operations
        const activeJobs = await this.context.getActiveJobs(jobTypes);
        const activeBatches = await this.context.getActiveBatches();
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
    return this.context.getConversation(conversationId);
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
    return this.context.getMessages(
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
    return this.context.searchConversations(query);
  }

  /**
   * Get the brain's identity data
   */
  public getIdentityData(): IdentityBody {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.getIdentity();
  }

  /**
   * Get app metadata (model and version)
   */
  public getAppInfo(): Promise<AppInfo> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.getAppInfo();
  }
}
