export type {
  PluginPackageConfig,
  PluginPackageConfigInput,
  PluginPackageDefinition,
  PluginPackageFamily,
} from "../package-definition";

import type {
  ContentVisibility,
  CountEntitiesRequest,
  EntitySearchRequest,
  SearchWithDistancesRequest,
  GetEntityRequest,
  ICoreEntityService,
  IEntitiesNamespace,
  ProjectSemanticSpaceRequest,
  SemanticEntityReference,
  SemanticSpaceDistanceRange,
  SemanticSpaceNeighbor,
  SemanticSpaceOrigin,
  SemanticSpacePoint,
  SemanticSpaceProjection,
  ListEntitiesRequest,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "@brains/entity-service";
import type {
  EntityAction,
  OutputFormat,
  UserPermissionLevel,
} from "@brains/templates";
import { z } from "@brains/utils/zod";
import type { AgentNamespace } from "../contracts/agent";
import type { AppInfo } from "../contracts/app-info";
import type { RuntimeHealthCheck } from "../contracts/runtime-health";
export type {
  ProjectionRule,
  ProjectionRuleDefinition,
} from "../entity/projection-rule";
import type { Conversation, Message } from "../contracts/conversations";
import type { AnchorProfile, BrainCharacter } from "../contracts/identity";
import type {
  MessageResponse,
  MessageSender,
  MessageWithPayload,
} from "../contracts/messaging";
import type { IEntityAINamespace } from "../entity/context";
import type {
  ChannelDeliveryProvider,
  ChannelDescriptor,
} from "../channel-registry";
import type { InboxSource } from "../inbox-registry";
import type {
  InboxFollowUpKindRegistration,
  InboxFollowUpResolutionInput,
  RegisteredInboxFollowUpKind,
  ResolvedInboxFollowUp,
} from "../inbox-follow-up-registry";
export type {
  ChannelDeliveryInput,
  ChannelDeliveryProvider,
  ChannelDeliveryResult,
  ChannelDeliveryThreading,
  ChannelDescriptor,
  ChannelSubjectPattern,
} from "../channel-registry";
export type {
  InboxAction,
  InboxActor,
  InboxEntityRef,
  InboxFacetDefinition,
  InboxFacetOption,
  InboxFacets,
  InboxFollowUpDeclaration,
  InboxItem,
  InboxItemDetail,
  InboxSource,
  InboxSourceMetadata,
} from "../inbox-registry";
export type {
  InboxFollowUpContext,
  InboxFollowUpJson,
  InboxFollowUpKindRegistration,
  InboxFollowUpMode,
  InboxFollowUpResolutionInput,
  InboxFollowUpTargetInput,
  RegisteredInboxFollowUpKind,
  ResolvedInboxFollowUp,
} from "../inbox-follow-up-registry";

export type PluginConfig = Record<string, unknown>;
export type PluginConfigInput<T extends { _input: unknown }> = T["_input"];

export interface SafeParserSchema<T> {
  safeParse(
    input: unknown,
  ):
    { success: true; data: T } | { success: false; error: { message: string } };
}

export interface JudgeInput<T> {
  instruction: string;
  material: string;
  schema: z.ZodType<T, unknown>;
}

export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly type: "core" | "entity" | "service" | "interface";
  readonly packageName: string;
  readonly description?: string | undefined;
  readonly dependencies?: string[] | undefined;
  finalizeRegistration?(): Promise<void>;
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

export type {
  Tool,
  ToolContext,
  ToolResponse,
  ToolConfirmation,
  ToolResult,
  ToolVisibility,
  ToolSideEffects,
  Resource,
  ResourceTemplate,
  Prompt,
} from "@brains/mcp-service";
export {
  createTool,
  createResource,
  toolSuccess,
  toolError,
} from "@brains/mcp-service";

export interface BaseJobTrackingInfo {
  rootJobId: string;
}

export interface MessageJobTrackingInfo extends BaseJobTrackingInfo {
  messageId?: string;
  channelId?: string;
}

export type JobProgressStatus =
  "pending" | "processing" | "completed" | "failed";

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
  conversationId?: string | undefined;
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

export const urlCaptureConfigSchema: z.ZodObject<{
  captureUrls: z.ZodDefault<z.ZodBoolean>;
  blockedUrlDomains: z.ZodDefault<z.ZodArray<z.ZodString>>;
}> = z.object({
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
  readonly schema: SafeParserSchema<TPayload>;
  readonly _response?: TResponse;
}

export function defineChannel<TPayload, TResponse = unknown>(
  name: string,
  schema: SafeParserSchema<TPayload>,
): Channel<TPayload, TResponse> {
  return { name, schema };
}

type PublicEntityServiceMethods =
  | "getEntity"
  | "listEntities"
  | "search"
  | "searchWithDistances"
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
  SearchWithDistancesRequest,
  GetEntityRequest,
  IEntitiesNamespace,
  ProjectSemanticSpaceRequest,
  SemanticEntityReference,
  SemanticSpaceDistanceRange,
  SemanticSpaceNeighbor,
  SemanticSpaceOrigin,
  SemanticSpacePoint,
  SemanticSpaceProjection,
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
    interfaceType?: string;
    sessionId?: string;
    channelId?: string;
    personId?: string;
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
  visibilityScope: ContentVisibility,
) => Promise<Record<string, unknown>>;

export interface IEvalNamespace {
  registerHandler(handlerId: string, handler: EvalHandler): void;
}

export interface IInsightsNamespace {
  register(type: string, handler: InsightHandler): void;
}

export interface ISemanticNamespace {
  project(
    request: ProjectSemanticSpaceRequest,
  ): Promise<SemanticSpaceProjection>;
}

export interface IPermissionsNamespace {
  assertEntityActionAllowed(
    entityType: string,
    action: EntityAction,
    context: { userPermissionLevel?: UserPermissionLevel | undefined },
  ): void;
}

export interface RuntimeUploadRecord {
  id: string;
  ref: { kind: string; id: string };
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface RuntimeUploadResponseBody extends RuntimeUploadRecord {
  url: string;
  downloadUrl: string;
}

export interface ResolvedRuntimeUpload {
  record: RuntimeUploadRecord;
  content: Buffer;
}

export interface SaveRuntimeUploadInput {
  filename: string;
  mediaType: string;
  content: Buffer;
  metadata?: Record<string, unknown> | undefined;
}

export interface RuntimeUploadScopeOptions {
  namespace: string;
  refKind: string;
  routePath: string;
  retentionMs?: number | undefined;
  maxCount?: number | undefined;
}

export interface RuntimeUploadStore {
  save(input: SaveRuntimeUploadInput): Promise<RuntimeUploadRecord>;
  read(uploadId: string): Promise<ResolvedRuntimeUpload>;
  readRecord(uploadId: string): Promise<RuntimeUploadRecord>;
  toResponseBody(record: RuntimeUploadRecord): RuntimeUploadResponseBody;
  prune(): Promise<void>;
  getUploadDir(uploadId: string): string;
}

export interface IRuntimeUploadsNamespace {
  scoped(options: RuntimeUploadScopeOptions): RuntimeUploadStore;
}

export interface IChannelsNamespace {
  listDescriptors(): ChannelDescriptor[];
  getDescriptor(channelType: string): ChannelDescriptor | undefined;
  getDeliveryProvider(channelType: string): ChannelDeliveryProvider | undefined;
}

export interface IMessageInterfaceChannelsNamespace extends IChannelsNamespace {
  registerDescriptor(descriptor: ChannelDescriptor): void;
  registerDeliveryProvider(provider: ChannelDeliveryProvider): void;
}

export interface IInboxNamespace {
  registerSource(source: InboxSource): void;
  listSources(): InboxSource[];
  getSource(sourceId: string): InboxSource | undefined;
}

export interface IInboxFollowUpsNamespace {
  registerKind(registration: InboxFollowUpKindRegistration): void;
  listKinds(): RegisteredInboxFollowUpKind[];
  getKind(kind: string): RegisteredInboxFollowUpKind | undefined;
  resolveUniversal(
    input: Omit<InboxFollowUpResolutionInput, "context">,
  ): Promise<ResolvedInboxFollowUp[]>;
}

export interface IOperationalHealthNamespace {
  register(
    name: string,
    provider: () =>
      | Promise<Omit<RuntimeHealthCheck, "name">>
      | Omit<RuntimeHealthCheck, "name">,
  ): () => void;
}

export interface BasePluginContext {
  readonly pluginId: string;
  readonly logger: Logger;
  readonly dataDir: string;
  readonly domain: string | undefined;
  readonly siteUrl: string | undefined;
  readonly localSiteUrl: string | undefined;
  readonly previewUrl: string | undefined;
  readonly preferLocalUrls: boolean;
  readonly appInfo: () => Promise<AppInfo>;
  readonly judge: <T>(input: JudgeInput<T>) => Promise<{
    verdict: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
  readonly entityService: IEntityService;
  readonly semantic: ISemanticNamespace;
  readonly identity: IIdentityNamespace;
  readonly channels: IChannelsNamespace;
  readonly inbox: IInboxNamespace;
  readonly inboxFollowUps: IInboxFollowUpsNamespace;
  readonly operationalHealth: IOperationalHealthNamespace;
  readonly messaging: IMessagingNamespace;
  readonly conversations: IConversationsNamespace;
  readonly eval: IEvalNamespace;
  readonly insights: IInsightsNamespace;
  readonly permissions: IPermissionsNamespace;
  readonly uploads: IRuntimeUploadsNamespace;
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
  hasRenderer(templateName: string, format?: OutputFormat): boolean;
  getRenderer(templateName: string, format?: OutputFormat): unknown | undefined;
  validate(templateName: string, content: unknown): boolean;
}

export interface FrontmatterSchemaParser {
  parse(data: unknown): unknown;
}

export interface EntityPluginEntitiesNamespace extends Omit<
  IEntitiesNamespace,
  "getEffectiveFrontmatterSchema"
> {
  getEffectiveFrontmatterSchema(
    type: string,
  ): FrontmatterSchemaParser | undefined;
}

export interface ServicePluginContext extends BasePluginContext {
  readonly entities: IEntitiesNamespace;
  readonly templates: IServiceTemplatesNamespace;
  readonly views: IViewsNamespace;
  readonly prompts: IPromptsNamespace;
  readonly ai: IEntityAINamespace;
  registerInstructions(instructions: string): void;
}

export interface EntityPluginContext extends BasePluginContext {
  readonly entities: EntityPluginEntitiesNamespace;
  readonly prompts: IPromptsNamespace;
}

export interface InterfacePluginContext extends BasePluginContext {
  readonly agent: AgentNamespace;
}

export interface MessageInterfacePluginContext extends InterfacePluginContext {
  readonly channels: IMessageInterfaceChannelsNamespace;
}
