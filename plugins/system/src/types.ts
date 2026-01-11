import type {
  DefaultQueryResponse,
  SearchResult,
  BaseEntity,
  AppInfo,
  BatchJobStatus,
  Batch,
  JobInfo,
  IdentityBody,
  ProfileBody,
  Conversation,
  Message,
} from "@brains/plugins";
import type { SearchOptions } from "./schemas";

/**
 * System plugin interface for tools and commands
 * This avoids circular dependencies by extracting the minimal interface needed
 */
export interface ISystemPlugin {
  /**
   * Get list of registered entity types
   */
  getEntityTypes(): string[];
  /**
   * Get entity counts grouped by type
   */
  getEntityCounts(): Promise<Array<{ entityType: string; count: number }>>;
  searchEntities(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]>;
  query(
    prompt: string,
    context?: Record<string, unknown>,
  ): Promise<DefaultQueryResponse>;
  getEntity(entityType: string, id: string): Promise<BaseEntity | null>;
  /**
   * Find entity by ID, slug, or title
   */
  findEntity(
    entityType: string,
    identifier: string,
  ): Promise<BaseEntity | null>;
  /**
   * List entities by type with optional filters
   */
  listEntities(
    entityType: string,
    options?: {
      limit?: number;
      filter?: Record<string, unknown>;
    },
  ): Promise<BaseEntity[]>;
  getJobStatus(
    batchId?: string,
    jobTypes?: string[],
  ): Promise<{
    batch?: BatchJobStatus | null;
    activeJobs?: JobInfo[];
    activeBatches?: Batch[];
  }>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  getMessages(conversationId: string, limit?: number): Promise<Message[]>;
  searchConversations(query: string): Promise<Conversation[]>;
  getIdentityData(): IdentityBody;
  getProfileData(): ProfileBody;
  getAppInfo(): Promise<AppInfo>;
}
