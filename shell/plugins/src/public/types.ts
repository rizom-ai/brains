import type {
  CountEntitiesRequest,
  EntitySearchRequest,
  GetEntityRequest,
  ICoreEntityService,
  IEntitiesNamespace,
  ListEntitiesRequest,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils";
import type { AgentNamespace } from "../contracts/agent";
import type { AppInfo } from "../contracts/app-info";
import type { Conversation, Message } from "../contracts/conversations";
import type { AnchorProfile, BrainCharacter } from "../contracts/identity";
import type {
  MessageResponse,
  MessageSender,
  MessageWithPayload,
} from "../contracts/messaging";

export type PluginConfig = Record<string, unknown>;
export type PluginConfigInput<T extends z.ZodTypeAny> = z.input<T>;

export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly type: "core" | "entity" | "service" | "interface";
  readonly packageName: string;
  readonly description?: string;
  readonly dependencies?: string[];
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
  requiresDaemonStartup?(): boolean;
}

export type PluginFactory = (config: PluginConfig) => Plugin | Plugin[];

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  child(context: string): Logger;
}

export interface ToolContext {
  progressToken?: string | number;
  sendProgress?: (notification: {
    progress?: number;
    total?: number;
    message?: string;
  }) => Promise<void>;
  interfaceType?: string;
  userId?: string;
  channelId?: string;
  channelName?: string;
}

export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type ToolVisibility = UserPermissionLevel;

export interface ToolConfirmation {
  required: boolean;
  message?: string;
}

export interface Tool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: TArgs, context: ToolContext) => Promise<TResult> | TResult;
  visibility?: ToolVisibility;
  confirmation?: ToolConfirmation;
}

export interface Resource<TResult = unknown> {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<TResult> | TResult;
}

export interface ResourceTemplate<K extends string = string> {
  uriTemplate: K;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export function createTool<TArgs = unknown, TResult = unknown>(
  tool: Tool<TArgs, TResult>,
): Tool<TArgs, TResult> {
  return tool;
}

export function createResource<TResult = unknown>(
  resource: Resource<TResult>,
): Resource<TResult> {
  return resource;
}

export function toolSuccess<T = unknown>(data?: T): ToolResponse<T> {
  return data === undefined ? { success: true } : { success: true, data };
}

export function toolError(error: string): ToolResponse<never> {
  return { success: false, error };
}

export interface BaseJobTrackingInfo {
  rootJobId: string;
}

export interface MessageJobTrackingInfo extends BaseJobTrackingInfo {
  messageId?: string;
  channelId?: string;
}

export type JobProgressStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface JobProgressContext {
  rootJobId: string;
  operationType:
    | "file_operations"
    | "content_operations"
    | "data_processing"
    | "batch_processing";
  pluginId?: string | undefined;
  progressToken?: string | number | undefined;
  operationTarget?: string | undefined;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
}

export interface JobProgressEvent {
  id: string;
  type: "job" | "batch";
  status: JobProgressStatus;
  message?: string | undefined;
  progress?:
    | {
        current: number;
        total: number;
        percentage: number;
      }
    | undefined;
  aggregationKey?: string | undefined;
  batchDetails?:
    | {
        totalOperations: number;
        completedOperations: number;
        failedOperations: number;
        currentOperation?: string | undefined;
        errors?: string[] | undefined;
      }
    | undefined;
  jobDetails?:
    | {
        jobType: string;
        priority: number;
        retryCount: number;
      }
    | undefined;
  metadata: JobProgressContext;
}

export const urlCaptureConfigSchema = z.object({
  captureUrls: z.boolean().default(false),
  blockedUrlDomains: z
    .array(z.string())
    .default([
      "meet.google.com",
      "zoom.us",
      "teams.microsoft.com",
      "whereby.com",
      "gather.town",
      "calendly.com",
      "cal.com",
      "discord.com",
      "discord.gg",
      "cdn.discordapp.com",
      "media.discordapp.net",
      "giphy.com",
      "tenor.com",
      "wetransfer.com",
      "file.io",
    ]),
});

export interface Channel<TPayload, TResponse = unknown> {
  readonly name: string;
  readonly schema: z.ZodType<TPayload>;
  readonly _response?: TResponse;
}

export function defineChannel<TPayload, TResponse = unknown>(
  name: string,
  schema: z.ZodType<TPayload>,
): Channel<TPayload, TResponse> {
  return { name, schema };
}

type PublicEntityServiceMethods =
  | "getEntity"
  | "listEntities"
  | "search"
  | "getEntityTypes"
  | "hasEntityType"
  | "countEntities"
  | "getEntityCounts"
  | "getEntityTypeConfig";

export type IEntityService = Pick<
  ICoreEntityService,
  PublicEntityServiceMethods
>;

export type {
  CountEntitiesRequest,
  EntitySearchRequest,
  GetEntityRequest,
  IEntitiesNamespace,
  ListEntitiesRequest,
  ListOptions,
  SearchOptions,
  SearchResult,
};

export interface IIdentityNamespace {
  get: () => BrainCharacter;
  getProfile: () => AnchorProfile;
  getAppInfo: () => Promise<AppInfo>;
}

export interface IConversationsNamespace {
  get(conversationId: string): Promise<Conversation | null>;
  search(query: string): Promise<Conversation[]>;
  list(options?: {
    limit?: number;
    updatedAfter?: string;
  }): Promise<Conversation[]>;
  getMessages(
    conversationId: string,
    options?: { limit?: number; range?: { start: number; end: number } },
  ): Promise<Message[]>;
}

export interface IMessagingNamespace {
  send: MessageSender;
  subscribe<T = unknown, R = unknown>(
    channel: string | Channel<T, R>,
    handler: (message: MessageWithPayload<T>) => Promise<MessageResponse<R>>,
  ): () => void;
}

export type EvalHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;

export type InsightHandler = (
  entityService: IEntityService,
) => Promise<Record<string, unknown>>;

export interface IEvalNamespace {
  registerHandler(handlerId: string, handler: EvalHandler): void;
}

export interface IInsightsNamespace {
  register(type: string, handler: InsightHandler): void;
}

export interface BasePluginContext {
  readonly pluginId: string;
  readonly logger: Logger;
  readonly dataDir: string;
  readonly domain: string | undefined;
  readonly siteUrl: string | undefined;
  readonly previewUrl: string | undefined;
  readonly appInfo: () => Promise<AppInfo>;
  readonly entityService: IEntityService;
  readonly identity: IIdentityNamespace;
  readonly messaging: IMessagingNamespace;
  readonly conversations: IConversationsNamespace;
  readonly eval: IEvalNamespace;
  readonly insights: IInsightsNamespace;
}

export interface IPromptsNamespace {
  resolve(target: string, fallback: string): Promise<string>;
}

export interface IServiceTemplatesNamespace {
  register(templates: unknown): void;
}

export interface IViewsNamespace {
  get(name: string): unknown | undefined;
  list(): unknown[];
  hasRenderer(templateName: string): boolean;
  getRenderer(templateName: string): unknown | undefined;
  validate(templateName: string, content: unknown): boolean;
}

export interface ServicePluginContext extends BasePluginContext {
  readonly entities: IEntitiesNamespace;
  readonly templates: IServiceTemplatesNamespace;
  readonly views: IViewsNamespace;
  readonly prompts: IPromptsNamespace;
  registerInstructions(instructions: string): void;
}

export interface EntityPluginContext extends BasePluginContext {
  readonly entities: IEntitiesNamespace;
  readonly prompts: IPromptsNamespace;
}

export interface InterfacePluginContext extends BasePluginContext {
  readonly agent: AgentNamespace;
}
