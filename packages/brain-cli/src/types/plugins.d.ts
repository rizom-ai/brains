import type { z } from "zod";

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  child(context: string): Logger;
}
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  CreateInterceptor,
  EntityAdapter,
  EntityTypeConfig,
  DataSource,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "./entities";
import type { Template, ViewTemplate, WebRenderer } from "./templates";
import type {
  Daemon,
  UserPermissionLevel,
  ApiRouteDefinition,
  WebRouteDefinition,
  MessageResponse,
  MessageSender,
  MessageWithPayload,
  MessageContext,
} from "./interfaces";
import type { BatchOperation, JobHandler, JobOptions } from "./services";

export interface ToolContext extends MessageContext {
  progressToken?: string | number;
  sendProgress?: (notification: {
    progress?: number;
    total?: number;
    message?: string;
  }) => Promise<void>;
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
): Tool<TArgs, TResult>;
export function createResource<TResult = unknown>(
  resource: Resource<TResult>,
): Resource<TResult>;
export function toolSuccess<T = unknown>(data?: T): ToolResponse<T>;
export function toolError(error: string): ToolResponse<never>;

export interface PluginCapabilities {
  tools: Tool[];
  resources: Resource[];
  instructions?: string;
}
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
export type PluginConfig = Record<string, unknown>;
export type PluginConfigInput<T extends z.ZodTypeAny> = z.input<T>;
export type InferPluginConfig<T extends z.ZodTypeAny> = z.infer<T>;
export const basePluginConfigSchema: z.ZodSchema<{
  enabled: boolean;
  debug: boolean;
}>;

export interface Channel<TPayload, TResponse = unknown> {
  readonly name: string;
  readonly schema: z.ZodType<TPayload>;
  readonly _response?: TResponse;
}
export function defineChannel<TPayload, TResponse = unknown>(
  name: string,
  schema: z.ZodType<TPayload>,
): Channel<TPayload, TResponse>;

export interface BaseJobTrackingInfo {
  rootJobId: string;
}
export interface MessageJobTrackingInfo extends BaseJobTrackingInfo {
  messageId?: string;
  channelId?: string;
}

export interface BrainCharacter {
  name: string;
  role: string;
  purpose: string;
  values: string[];
}

export interface AnchorProfile {
  name: string;
  kind: "professional" | "team" | "collective";
  organization?: string;
  description?: string;
  avatar?: string;
  website?: string;
  email?: string;
  socialLinks?: Array<{
    platform: "github" | "instagram" | "linkedin" | "email" | "website";
    url: string;
    label?: string;
  }>;
}

export interface AppInfo {
  model: string;
  version: string;
  uptime: number;
  entities: number;
  embeddings: number;
  ai: { model: string; embeddingModel: string };
  daemons: unknown[];
  endpoints: Array<{
    label: string;
    url: string;
    pluginId: string;
    priority: number;
  }>;
}

export interface Conversation {
  id: string;
  sessionId: string;
  interfaceType: string;
  channelId: string;
  channelName: string;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  timestamp: string;
  metadata: string | null;
}

export interface GetMessagesOptions {
  limit?: number;
  range?: { start: number; end: number };
}

export interface IEntityService {
  getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null>;
  listEntities<T extends BaseEntity>(
    type: string,
    options?: ListOptions,
  ): Promise<T[]>;
  search<T extends BaseEntity = BaseEntity>(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<T>[]>;
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;
  countEntities(
    entityType: string,
    options?: Pick<ListOptions, "publishedOnly">,
  ): Promise<number>;
  getEntityCounts(): Promise<Array<{ entityType: string; count: number }>>;
}

export type EvalHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;

export type InsightHandler = (
  entityService: IEntityService,
) => Promise<Record<string, unknown>>;

export interface PendingConfirmation {
  toolName: string;
  description: string;
  args: unknown;
}

export interface ToolResultData {
  toolName: string;
  args?: Record<string, unknown>;
  jobId?: string;
  data?: unknown;
}

export interface AgentResponse {
  text: string;
  toolResults?: ToolResultData[];
  pendingConfirmation?: PendingConfirmation;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatContext {
  userPermissionLevel?: UserPermissionLevel;
  interfaceType?: string;
  channelId?: string;
  channelName?: string;
}

export interface IAgentService {
  chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
  ): Promise<AgentResponse>;
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
  readonly identity: {
    get: () => BrainCharacter;
    getProfile: () => AnchorProfile;
    getAppInfo: () => Promise<AppInfo>;
  };
  readonly messaging: {
    send: MessageSender;
    subscribe: <T = unknown, R = unknown>(
      channel: string | Channel<T, R>,
      handler: (
        message: MessageWithPayload<T> | T,
      ) => Promise<MessageResponse<R>> | MessageResponse<R>,
    ) => () => void;
  };
  readonly jobs: {
    enqueue(
      type: string,
      data: unknown,
      toolContext?: ToolContext | null,
      options?: JobOptions,
    ): Promise<string>;
    enqueueBatch(
      operations: BatchOperation[],
      options?: JobOptions,
    ): Promise<string>;
    registerHandler(type: string, handler: JobHandler): void;
  };
  readonly conversations: {
    get(conversationId: string): Promise<Conversation | null>;
    search(query: string): Promise<Conversation[]>;
    getMessages(
      conversationId: string,
      options?: GetMessagesOptions,
    ): Promise<Message[]>;
  };
  readonly eval: {
    registerHandler<TInput = unknown, TOutput = unknown>(
      handlerId: string,
      handler: EvalHandler<TInput, TOutput>,
    ): void;
  };
  readonly insights: {
    register(type: string, handler: InsightHandler): void;
  };
  readonly endpoints: {
    register(endpoint: { label: string; url: string; priority?: number }): void;
  };
}

export interface EntityPluginContext extends BasePluginContext {
  readonly entityService: IEntityService;
  readonly entities: {
    register<T extends BaseEntity>(
      entityType: string,
      schema: z.ZodSchema<T>,
      adapter: EntityAdapter<T>,
      config?: EntityTypeConfig,
    ): void;
    getAdapter<T extends BaseEntity>(
      entityType: string,
    ): EntityAdapter<T> | undefined;
    extendFrontmatterSchema(
      type: string,
      extension: z.ZodObject<z.ZodRawShape>,
    ): void;
    getEffectiveFrontmatterSchema(
      type: string,
    ): z.ZodObject<z.ZodRawShape> | undefined;
    update<T extends BaseEntity>(
      entity: T,
    ): Promise<{ entityId: string; jobId: string }>;
    registerDataSource(dataSource: DataSource): void;
    registerCreateInterceptor(
      entityType: string,
      interceptor: CreateInterceptor,
    ): void;
  };
  readonly ai: {
    query(prompt: string, context?: ChatContext): Promise<AgentResponse>;
    generate<T = unknown>(config: Record<string, unknown>): Promise<T>;
    generateObject<T>(
      prompt: string,
      schema: z.ZodType<T>,
    ): Promise<{ object: T }>;
    generateImage(
      prompt: string,
      options?: Record<string, unknown>,
    ): Promise<{ url?: string; data?: Uint8Array; mimeType?: string }>;
    canGenerateImages(): boolean;
  };
  readonly prompts: {
    resolve(target: string, fallback: string): Promise<string>;
  };
}
export interface ServicePluginContext extends BasePluginContext {
  readonly entityService: IEntityService;
  readonly entities: EntityPluginContext["entities"];
  readonly templates: {
    register(templates: Record<string, Template>, namespace?: string): void;
    format<T = unknown>(templateName: string, data: T): string;
    parse<T = unknown>(templateName: string, content: string): T;
    resolve<T = unknown>(
      templateName: string,
      options?: Record<string, unknown>,
    ): Promise<T | null>;
  };
  readonly views: {
    get(name: string): ViewTemplate | undefined;
    list(): ViewTemplate[];
    hasRenderer(templateName: string): boolean;
    getRenderer(templateName: string): WebRenderer | undefined;
    validate(templateName: string, content: unknown): boolean;
  };
  readonly prompts: EntityPluginContext["prompts"];
  registerInstructions(instructions: string): void;
}
export interface InterfacePluginContext extends BasePluginContext {
  readonly mcpTransport: unknown;
  readonly agentService: IAgentService;
  readonly permissions: {
    getUserLevel(interfaceType: string, userId: string): UserPermissionLevel;
  };
  readonly daemons: { register(name: string, daemon: Daemon): void };
  readonly conversations: BasePluginContext["conversations"] & {
    start(
      conversationId: string,
      interfaceType: string,
      channelId: string,
      metadata: Record<string, unknown>,
    ): Promise<string>;
    addMessage(
      conversationId: string,
      role: string,
      content: string,
      metadata?: Record<string, unknown>,
    ): Promise<void>;
  };
  readonly tools: {
    listForPermissionLevel(level: UserPermissionLevel): unknown[];
  };
  readonly apiRoutes: { getRoutes(): unknown[]; getMessageBus(): unknown };
  readonly webRoutes: { getRoutes(): unknown[] };
  readonly plugins: { has(pluginId: string): boolean };
}

export type DeriveEvent = "created" | "updated" | "deleted" | "extract";
export abstract class EntityPlugin<
  TEntity extends BaseEntity = BaseEntity,
  TConfig = Record<string, never>,
> implements Plugin {
  readonly type: "entity";
  readonly id: string;
  readonly version: string;
  readonly packageName: string;
  readonly description?: string;
  abstract readonly entityType: string;
  abstract readonly schema: z.ZodSchema<TEntity>;
  abstract readonly adapter: EntityAdapter<TEntity>;
  protected constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config?: Partial<TConfig>,
    configSchema?: z.ZodTypeAny,
  );
  protected onRegister(context: EntityPluginContext): Promise<void>;
  protected onReady(context: EntityPluginContext): Promise<void>;
  protected onShutdown(): Promise<void>;
  protected interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult>;
  protected createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null;
  protected getTemplates(): Record<string, Template> | null;
  protected getDataSources(): DataSource[];
  protected getEntityTypeConfig(): EntityTypeConfig | undefined;
  protected derive(
    source: BaseEntity,
    event: DeriveEvent,
    context: EntityPluginContext,
  ): Promise<void>;
  protected deriveAll(context: EntityPluginContext): Promise<void>;
  protected rebuildAll(context: EntityPluginContext): Promise<void>;
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
}
export abstract class ServicePlugin<TConfig = unknown> implements Plugin {
  readonly type: "service";
  readonly id: string;
  readonly version: string;
  readonly packageName: string;
  readonly description?: string;
  protected constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config?: Partial<TConfig>,
    configSchema?: z.ZodTypeAny,
  );
  protected onRegister(context: ServicePluginContext): Promise<void>;
  protected onReady(context: ServicePluginContext): Promise<void>;
  protected onShutdown(): Promise<void>;
  protected getTools(): Promise<Tool[]>;
  protected getResources(): Promise<Resource[]>;
  protected getInstructions(): Promise<string | undefined>;
  getApiRoutes(): ApiRouteDefinition[];
  getWebRoutes(): WebRouteDefinition[];
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
}
export abstract class InterfacePlugin<
  TConfig = unknown,
  TTrackingInfo extends BaseJobTrackingInfo = BaseJobTrackingInfo,
> implements Plugin {
  readonly type: "interface";
  readonly id: string;
  readonly version: string;
  readonly packageName: string;
  readonly description?: string;
  protected readonly jobTrackingEntries: Map<string, TTrackingInfo>;
  protected constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config?: Partial<TConfig>,
    configSchema?: z.ZodTypeAny,
  );
  protected onRegister(context: InterfacePluginContext): Promise<void>;
  protected onReady(context: InterfacePluginContext): Promise<void>;
  protected onShutdown(): Promise<void>;
  protected createDaemon(): Daemon | undefined;
  requiresDaemonStartup(): boolean;
  getWebRoutes(): WebRouteDefinition[];
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
}
export abstract class MessageInterfacePlugin<
  TConfig = unknown,
  TTrackingInfo extends MessageJobTrackingInfo = MessageJobTrackingInfo,
> extends InterfacePlugin<TConfig, TTrackingInfo> {
  protected isUploadableTextFile(filename: string, mimetype?: string): boolean;
  protected isFileSizeAllowed(size: number): boolean;
  protected formatFileUploadMessage(filename: string, content: string): string;
}

export const urlCaptureConfigSchema: z.ZodSchema<{
  captureUrls: boolean;
  blockedUrlDomains: string[];
}>;
export function parseConfirmationResponse(input: string): boolean | undefined;
export function formatConfirmationPrompt(action: string): string;
