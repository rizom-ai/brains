import { EntityPlugin as RuntimeEntityPlugin } from "../entity/entity-plugin";
import { InterfacePlugin as RuntimeInterfacePlugin } from "../interface/interface-plugin";
import { MessageInterfacePlugin as RuntimeMessageInterfacePlugin } from "../message-interface/message-interface-plugin";
import { ServicePlugin as RuntimeServicePlugin } from "../service/service-plugin";
import type {
  IShell,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  DataSource,
  EntityAdapter,
  EntityTypeConfig,
} from "@brains/entity-service";
import { z } from "zod";
import type { AgentNamespace } from "../contracts/agent";
import type { WebRouteDefinition } from "../types/web-routes";
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

export type ToolVisibility = "public" | "trusted" | "anchor";

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

export interface IEntityService {
  getEntity<T = unknown>(entityType: string, id: string): Promise<T | null>;
  listEntities<T = unknown>(type: string, options?: unknown): Promise<T[]>;
  search<T = unknown>(query: string, options?: unknown): Promise<T[]>;
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;
  countEntities(entityType: string, options?: unknown): Promise<number>;
  getEntityCounts(): Promise<Array<{ entityType: string; count: number }>>;
}

export interface IIdentityNamespace {
  get: () => BrainCharacter;
  getProfile: () => AnchorProfile;
  getAppInfo: () => Promise<AppInfo>;
}

export interface IConversationsNamespace {
  get(conversationId: string): Promise<Conversation | null>;
  search(query: string): Promise<Conversation[]>;
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
  registerHandler<TInput = unknown, TOutput = unknown>(
    handlerId: string,
    handler: EvalHandler<TInput, TOutput>,
  ): void;
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

export interface IEntitiesNamespace {
  register<TEntity extends BaseEntity>(
    entityType: string,
    schema: z.ZodSchema<TEntity>,
    adapter: EntityAdapter<TEntity>,
    config?: EntityTypeConfig,
  ): void;
  getAdapter<TEntity extends BaseEntity>(
    entityType: string,
  ): EntityAdapter<TEntity> | undefined;
  update<TEntity extends BaseEntity>(
    entity: TEntity,
  ): Promise<{ entityId: string; jobId: string }>;
  registerDataSource(dataSource: DataSource): void;
  registerCreateInterceptor(
    entityType: string,
    interceptor: (
      input: CreateInput,
      executionContext: CreateExecutionContext,
    ) => Promise<CreateInterceptionResult>,
  ): void;
}

export interface IPromptsNamespace {
  resolve(target: string, fallback: string): Promise<string>;
}

export interface IServiceTemplatesNamespace {
  register(templates: unknown): void;
}

export interface IViewsNamespace {
  register(views: unknown): void;
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

interface EntityPluginHooks<TEntity extends BaseEntity> {
  getEntityType(): string;
  getSchema(): z.ZodSchema<TEntity>;
  getAdapter(): EntityAdapter<TEntity>;
  onRegister(context: EntityPluginContext): Promise<void>;
  onReady(context: EntityPluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getEntityTypeConfig(): EntityTypeConfig | undefined;
  getDataSources(): DataSource[];
  getInstructions(): Promise<string | undefined>;
  interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult>;
}

class EntityPluginDelegate<
  TEntity extends BaseEntity,
  TConfig,
> extends RuntimeEntityPlugin<TEntity, TConfig> {
  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
    private readonly hooks: EntityPluginHooks<TEntity>,
  ) {
    super(id, packageJson, config, configSchema);
  }

  override get entityType(): string {
    return this.hooks.getEntityType();
  }

  override get schema(): z.ZodSchema<TEntity> {
    return this.hooks.getSchema();
  }

  override get adapter(): EntityAdapter<TEntity> {
    return this.hooks.getAdapter();
  }

  protected override onRegister(context: never): Promise<void> {
    return this.hooks.onRegister(context as EntityPluginContext);
  }

  protected override onReady(context: never): Promise<void> {
    return this.hooks.onReady(context as EntityPluginContext);
  }

  protected override onShutdown(): Promise<void> {
    return this.hooks.onShutdown();
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return this.hooks.getEntityTypeConfig();
  }

  protected override getDataSources(): DataSource[] {
    return this.hooks.getDataSources();
  }

  protected override getInstructions(): Promise<string | undefined> {
    return this.hooks.getInstructions();
  }

  protected override interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: never,
  ): Promise<CreateInterceptionResult> {
    return this.hooks.interceptCreate(
      input,
      executionContext,
      context as EntityPluginContext,
    );
  }
}

export abstract class EntityPlugin<
  TEntity extends BaseEntity = BaseEntity,
  TConfig = unknown,
> implements Plugin {
  public readonly type = "entity" as const;
  public readonly id: string;
  public readonly version: string;
  public readonly packageName: string;
  public readonly description?: string;
  public abstract readonly entityType: string;
  public abstract readonly schema: z.ZodSchema<TEntity>;
  public abstract readonly adapter: EntityAdapter<TEntity>;
  private readonly delegate: EntityPluginDelegate<TEntity, TConfig>;

  protected constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
  ) {
    this.id = id;
    this.version = packageJson.version;
    this.packageName = packageJson.name;
    if (packageJson.description !== undefined) {
      this.description = packageJson.description;
    }
    this.delegate = new EntityPluginDelegate(
      id,
      packageJson,
      config,
      configSchema,
      {
        getEntityType: (): string => this.entityType,
        getSchema: (): z.ZodSchema<TEntity> => this.schema,
        getAdapter: (): EntityAdapter<TEntity> => this.adapter,
        onRegister: (context): Promise<void> => this.onRegister(context),
        onReady: (context): Promise<void> => this.onReady(context),
        onShutdown: (): Promise<void> => this.onShutdown(),
        getEntityTypeConfig: (): EntityTypeConfig | undefined =>
          this.getEntityTypeConfig(),
        getDataSources: (): DataSource[] => this.getDataSources(),
        getInstructions: (): Promise<string | undefined> =>
          this.getInstructions(),
        interceptCreate: (
          input,
          executionContext,
          context,
        ): Promise<CreateInterceptionResult> =>
          this.interceptCreate(input, executionContext, context),
      },
    );
  }

  /** @internal */
  register(
    shell: IShell,
    context?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    return this.delegate.register(shell, context);
  }

  protected async onRegister(_context: EntityPluginContext): Promise<void> {}
  protected async onReady(_context: EntityPluginContext): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
  protected async getInstructions(): Promise<string | undefined> {
    return undefined;
  }
  protected getEntityTypeConfig(): EntityTypeConfig | undefined {
    return undefined;
  }
  protected getDataSources(): DataSource[] {
    return [];
  }
  protected async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    _context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return { kind: "continue", input };
  }

  ready(): Promise<void> {
    return this.delegate.ready();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown?.() ?? Promise.resolve();
  }
}

interface InterfacePluginHooks {
  onRegister(context: InterfacePluginContext): Promise<void>;
  onReady(context: InterfacePluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getTools(): Promise<Tool[]>;
  getResources(): Promise<Resource[]>;
  getInstructions(): Promise<string | undefined>;
  getWebRoutes(): WebRouteDefinition[];
  requiresDaemonStartup(): boolean;
}

class InterfacePluginDelegate<
  TConfig,
  TTrackingInfo extends BaseJobTrackingInfo,
> extends RuntimeInterfacePlugin<TConfig, TTrackingInfo> {
  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
    private readonly hooks: InterfacePluginHooks,
  ) {
    super(id, packageJson, config, configSchema);
  }

  protected override onRegister(context: never): Promise<void> {
    return this.hooks.onRegister(context as InterfacePluginContext);
  }

  protected override onReady(context: never): Promise<void> {
    return this.hooks.onReady(context as InterfacePluginContext);
  }

  protected override onShutdown(): Promise<void> {
    return this.hooks.onShutdown();
  }

  protected override getTools(): Promise<never[]> {
    return this.hooks.getTools() as Promise<never[]>;
  }

  protected override getResources(): Promise<never[]> {
    return this.hooks.getResources() as Promise<never[]>;
  }

  protected override getInstructions(): Promise<string | undefined> {
    return this.hooks.getInstructions();
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.hooks.getWebRoutes();
  }

  override requiresDaemonStartup(): boolean {
    return this.hooks.requiresDaemonStartup();
  }
}

export abstract class InterfacePlugin<
  TConfig = unknown,
  TTrackingInfo extends BaseJobTrackingInfo = BaseJobTrackingInfo,
> implements Plugin {
  public readonly type = "interface" as const;
  public readonly id: string;
  public readonly version: string;
  public readonly packageName: string;
  public readonly description?: string;
  private readonly delegate: InterfacePluginDelegate<TConfig, TTrackingInfo>;

  protected constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
  ) {
    this.id = id;
    this.version = packageJson.version;
    this.packageName = packageJson.name;
    if (packageJson.description !== undefined) {
      this.description = packageJson.description;
    }
    this.delegate = new InterfacePluginDelegate(
      id,
      packageJson,
      config,
      configSchema,
      {
        onRegister: (context): Promise<void> => this.onRegister(context),
        onReady: (context): Promise<void> => this.onReady(context),
        onShutdown: (): Promise<void> => this.onShutdown(),
        getTools: (): Promise<Tool[]> => this.getTools(),
        getResources: (): Promise<Resource[]> => this.getResources(),
        getInstructions: (): Promise<string | undefined> =>
          this.getInstructions(),
        getWebRoutes: (): WebRouteDefinition[] => this.getWebRoutes(),
        requiresDaemonStartup: (): boolean => this.requiresDaemonStartup(),
      },
    );
  }

  /** @internal */
  register(
    shell: IShell,
    context?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    return this.delegate.register(shell, context);
  }

  protected async onRegister(_context: InterfacePluginContext): Promise<void> {}
  protected async onReady(_context: InterfacePluginContext): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
  protected async getTools(): Promise<Tool[]> {
    return [];
  }
  protected async getResources(): Promise<Resource[]> {
    return [];
  }
  protected async getInstructions(): Promise<string | undefined> {
    return undefined;
  }

  getWebRoutes(): WebRouteDefinition[] {
    return [];
  }

  requiresDaemonStartup(): boolean {
    return false;
  }

  ready(): Promise<void> {
    return this.delegate.ready();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown?.() ?? Promise.resolve();
  }
}

interface MessageInterfacePluginHooks {
  onRegister(context: InterfacePluginContext): Promise<void>;
  onReady(context: InterfacePluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getTools(): Promise<Tool[]>;
  getResources(): Promise<Resource[]>;
  getInstructions(): Promise<string | undefined>;
  getWebRoutes(): WebRouteDefinition[];
  requiresDaemonStartup(): boolean;
  sendMessageToChannel(channelId: string | null, message: string): void;
  sendMessageWithId(
    channelId: string | null,
    message: string,
  ): Promise<string | undefined>;
  editMessage(
    channelId: string,
    messageId: string,
    newMessage: string,
  ): Promise<boolean>;
  supportsMessageEditing(): boolean;
  onProgressUpdate(event: JobProgressEvent): Promise<void>;
}

class MessageInterfacePluginDelegate<
  TConfig,
  TTrackingInfo extends MessageJobTrackingInfo,
> extends RuntimeMessageInterfacePlugin<TConfig, TTrackingInfo> {
  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
    private readonly hooks: MessageInterfacePluginHooks,
  ) {
    super(id, packageJson, config, configSchema);
  }

  protected override async onRegister(context: never): Promise<void> {
    await super.onRegister(context);
    await this.hooks.onRegister(context as InterfacePluginContext);
  }

  protected override onReady(context: never): Promise<void> {
    return this.hooks.onReady(context as InterfacePluginContext);
  }

  protected override onShutdown(): Promise<void> {
    return this.hooks.onShutdown();
  }

  protected override getTools(): Promise<never[]> {
    return this.hooks.getTools() as Promise<never[]>;
  }

  protected override getResources(): Promise<never[]> {
    return this.hooks.getResources() as Promise<never[]>;
  }

  protected override getInstructions(): Promise<string | undefined> {
    return this.hooks.getInstructions();
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.hooks.getWebRoutes();
  }

  override requiresDaemonStartup(): boolean {
    return this.hooks.requiresDaemonStartup();
  }

  protected override sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void {
    this.hooks.sendMessageToChannel(channelId, message);
  }

  protected override sendMessageWithId(
    channelId: string | null,
    message: string,
  ): Promise<string | undefined> {
    return this.hooks.sendMessageWithId(channelId, message);
  }

  protected override editMessage(
    channelId: string,
    messageId: string,
    newMessage: string,
  ): Promise<boolean> {
    return this.hooks.editMessage(channelId, messageId, newMessage);
  }

  protected override supportsMessageEditing(): boolean {
    return this.hooks.supportsMessageEditing();
  }

  protected override onProgressUpdate(event: JobProgressEvent): Promise<void> {
    return this.hooks.onProgressUpdate(event);
  }

  trackAgentResponseForJobPublic(
    jobId: string,
    messageId: string,
    channelId: string,
  ): void {
    this.trackAgentResponseForJob(jobId, messageId, channelId);
  }

  captureUrlViaAgentPublic(
    url: string,
    channelId: string,
    authorId: string,
    interfaceType: string,
  ): Promise<void> {
    return this.captureUrlViaAgent(url, channelId, authorId, interfaceType);
  }

  getCurrentChannelIdPublic(): string | null {
    return this.getCurrentChannelId();
  }
}

export abstract class MessageInterfacePlugin<
  TConfig = unknown,
  TTrackingInfo extends MessageJobTrackingInfo = MessageJobTrackingInfo,
> extends InterfacePlugin<TConfig, TTrackingInfo> {
  private readonly messageDelegate: MessageInterfacePluginDelegate<
    TConfig,
    TTrackingInfo
  >;

  protected constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
  ) {
    super(id, packageJson, config, configSchema);
    this.messageDelegate = new MessageInterfacePluginDelegate(
      id,
      packageJson,
      config,
      configSchema,
      {
        onRegister: (context): Promise<void> => this.onRegister(context),
        onReady: (context): Promise<void> => this.onReady(context),
        onShutdown: (): Promise<void> => this.onShutdown(),
        getTools: (): Promise<Tool[]> => this.getTools(),
        getResources: (): Promise<Resource[]> => this.getResources(),
        getInstructions: (): Promise<string | undefined> =>
          this.getInstructions(),
        getWebRoutes: (): WebRouteDefinition[] => this.getWebRoutes(),
        requiresDaemonStartup: (): boolean => this.requiresDaemonStartup(),
        sendMessageToChannel: (channelId, message): void =>
          this.sendMessageToChannel(channelId, message),
        sendMessageWithId: (channelId, message): Promise<string | undefined> =>
          this.sendMessageWithId(channelId, message),
        editMessage: (channelId, messageId, newMessage): Promise<boolean> =>
          this.editMessage(channelId, messageId, newMessage),
        supportsMessageEditing: (): boolean => this.supportsMessageEditing(),
        onProgressUpdate: (event): Promise<void> =>
          this.onProgressUpdate(event),
      },
    );
  }

  /** @internal */
  override register(
    shell: IShell,
    context?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    return this.messageDelegate.register(shell, context);
  }

  protected abstract sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void;

  protected override async onRegister(
    _context: InterfacePluginContext,
  ): Promise<void> {}
  protected override async onReady(
    _context: InterfacePluginContext,
  ): Promise<void> {}
  protected override async onShutdown(): Promise<void> {}
  protected override async getTools(): Promise<Tool[]> {
    return [];
  }
  protected override async getResources(): Promise<Resource[]> {
    return [];
  }
  protected override async getInstructions(): Promise<string | undefined> {
    return undefined;
  }
  protected sendMessageWithId(
    _channelId: string | null,
    _message: string,
  ): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }
  protected editMessage(
    _channelId: string,
    _messageId: string,
    _newMessage: string,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }
  protected supportsMessageEditing(): boolean {
    return false;
  }
  protected async onProgressUpdate(_event: JobProgressEvent): Promise<void> {}

  protected isUploadableTextFile(filename: string, mimetype?: string): boolean {
    const textFileExtensions = [".md", ".txt", ".markdown"];
    const textMimeTypes = ["text/plain", "text/markdown", "text/x-markdown"];
    if (mimetype && textMimeTypes.some((type) => mimetype.startsWith(type))) {
      return true;
    }
    return textFileExtensions.some((extension) =>
      filename.toLowerCase().endsWith(extension),
    );
  }

  protected isFileSizeAllowed(size: number): boolean {
    return size <= 100_000;
  }

  protected formatFileUploadMessage(filename: string, content: string): string {
    return `User uploaded a file "${filename}":\n\n${content}`;
  }

  protected extractCaptureableUrls(
    content: string,
    blockedDomains: string[],
  ): string[] {
    const matches =
      content.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+?(?=[,;:\s]|$)/gi) ?? [];
    return [...new Set(matches)].filter((url) => {
      try {
        const { hostname } = new URL(url);
        return !blockedDomains.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
        );
      } catch {
        return false;
      }
    });
  }

  protected captureUrlViaAgent(
    url: string,
    channelId: string,
    authorId: string,
    interfaceType: string,
  ): Promise<void> {
    return this.messageDelegate.captureUrlViaAgentPublic(
      url,
      channelId,
      authorId,
      interfaceType,
    );
  }

  protected trackAgentResponseForJob(
    jobId: string,
    messageId: string,
    channelId: string,
  ): void {
    this.messageDelegate.trackAgentResponseForJobPublic(
      jobId,
      messageId,
      channelId,
    );
  }

  public registerProgressCallback(
    callback: (events: JobProgressEvent[]) => void,
  ): void {
    this.messageDelegate.registerProgressCallback(
      callback as (events: JobProgressEvent[]) => void,
    );
  }

  public unregisterProgressCallback(): void {
    this.messageDelegate.unregisterProgressCallback();
  }

  public getProgressEvents(): JobProgressEvent[] {
    return this.messageDelegate.getProgressEvents() as JobProgressEvent[];
  }

  public getActiveProgressEvents(): JobProgressEvent[] {
    return this.messageDelegate.getActiveProgressEvents() as JobProgressEvent[];
  }

  public startProcessingInput(channelId: string | null = null): void {
    this.messageDelegate.startProcessingInput(channelId);
  }

  public endProcessingInput(): void {
    this.messageDelegate.endProcessingInput();
  }

  protected getCurrentChannelId(): string | null {
    return this.messageDelegate.getCurrentChannelIdPublic();
  }

  override ready(): Promise<void> {
    return this.messageDelegate.ready();
  }

  override shutdown(): Promise<void> {
    return this.messageDelegate.shutdown?.() ?? Promise.resolve();
  }
}

interface ServicePluginHooks {
  onRegister(context: ServicePluginContext): Promise<void>;
  onReady(context: ServicePluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getTools(): Promise<Tool[]>;
  getResources(): Promise<Resource[]>;
  getInstructions(): Promise<string | undefined>;
}

class ServicePluginDelegate<TConfig> extends RuntimeServicePlugin<TConfig> {
  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
    private readonly hooks: ServicePluginHooks,
  ) {
    super(id, packageJson, config, configSchema);
  }

  protected override onRegister(context: never): Promise<void> {
    return this.hooks.onRegister(context as ServicePluginContext);
  }

  protected override onReady(context: never): Promise<void> {
    return this.hooks.onReady(context as ServicePluginContext);
  }

  protected override onShutdown(): Promise<void> {
    return this.hooks.onShutdown();
  }

  protected override getTools(): Promise<never[]> {
    return this.hooks.getTools() as Promise<never[]>;
  }

  protected override getResources(): Promise<never[]> {
    return this.hooks.getResources() as Promise<never[]>;
  }

  protected override getInstructions(): Promise<string | undefined> {
    return this.hooks.getInstructions();
  }
}

export abstract class ServicePlugin<TConfig = unknown> implements Plugin {
  public readonly type = "service" as const;
  public readonly id: string;
  public readonly version: string;
  public readonly packageName: string;
  public readonly description?: string;
  private readonly delegate: ServicePluginDelegate<TConfig>;

  protected constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
  ) {
    this.id = id;
    this.version = packageJson.version;
    this.packageName = packageJson.name;
    if (packageJson.description !== undefined) {
      this.description = packageJson.description;
    }
    this.delegate = new ServicePluginDelegate(
      id,
      packageJson,
      config,
      configSchema,
      {
        onRegister: (context): Promise<void> => this.onRegister(context),
        onReady: (context): Promise<void> => this.onReady(context),
        onShutdown: (): Promise<void> => this.onShutdown(),
        getTools: (): Promise<Tool[]> => this.getTools(),
        getResources: (): Promise<Resource[]> => this.getResources(),
        getInstructions: (): Promise<string | undefined> =>
          this.getInstructions(),
      },
    );
  }

  /** @internal */
  register(
    shell: IShell,
    context?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    return this.delegate.register(shell, context);
  }

  protected async onRegister(_context: ServicePluginContext): Promise<void> {}
  protected async onReady(_context: ServicePluginContext): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
  protected async getTools(): Promise<Tool[]> {
    return [];
  }
  protected async getResources(): Promise<Resource[]> {
    return [];
  }
  protected async getInstructions(): Promise<string | undefined> {
    return undefined;
  }

  ready(): Promise<void> {
    return this.delegate.ready();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown?.() ?? Promise.resolve();
  }
}
