import { ServicePlugin as RuntimeServicePlugin } from "../service/service-plugin";
import type {
  IShell,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import type { z } from "zod";
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
  register(...args: unknown[]): void;
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
