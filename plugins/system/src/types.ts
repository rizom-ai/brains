import type {
  DefaultQueryResponse,
  SearchResult,
  BaseEntity,
  AppInfo,
} from "@brains/plugins";
import type { BatchJobStatus, Batch, JobInfo } from "@brains/job-queue";
import type { Conversation, Message } from "@brains/conversation-service";
import type { IdentityBody } from "@brains/identity-service";
import type { SearchOptions } from "./schemas";

/**
 * System plugin interface for tools and commands
 * This avoids circular dependencies by extracting the minimal interface needed
 */
export interface ISystemPlugin {
  searchEntities(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]>;
  query(
    prompt: string,
    context?: Record<string, unknown>,
  ): Promise<DefaultQueryResponse>;
  getEntity(entityType: string, id: string): Promise<BaseEntity | null>;
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
  getAppInfo(): Promise<AppInfo>;
}
