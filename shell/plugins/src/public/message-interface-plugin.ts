import { MessageInterfacePlugin as RuntimeMessageInterfacePlugin } from "../message-interface/message-interface-plugin";
import type {
  EditMessageRequest,
  SendMessageToChannelRequest,
  SendMessageWithIdRequest,
} from "../message-interface/message-interface-plugin";
import type {
  IShell,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import type { WebRouteDefinition } from "../types/web-routes";
import type { z } from "@brains/utils";
import { InterfacePlugin } from "./interface-plugin";
import type {
  InterfacePluginContext,
  JobProgressEvent,
  MessageJobTrackingInfo,
  Resource,
  Tool,
} from "./types";

interface MessageInterfacePluginHooks {
  onRegister(context: InterfacePluginContext): Promise<void>;
  onReady(context: InterfacePluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getTools(): Promise<Tool[]>;
  getResources(): Promise<Resource[]>;
  getInstructions(): Promise<string | undefined>;
  getWebRoutes(): WebRouteDefinition[];
  requiresDaemonStartup(): boolean;
  sendMessageToChannel(request: SendMessageToChannelRequest): void;
  sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined>;
  editMessage(request: EditMessageRequest): Promise<boolean>;
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
    request: SendMessageToChannelRequest,
  ): void {
    this.hooks.sendMessageToChannel(request);
  }

  protected override sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    return this.hooks.sendMessageWithId(request);
  }

  protected override editMessage(
    request: EditMessageRequest,
  ): Promise<boolean> {
    return this.hooks.editMessage(request);
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
        sendMessageToChannel: (request): void =>
          this.sendMessageToChannel(request),
        sendMessageWithId: (request): Promise<string | undefined> =>
          this.sendMessageWithId(request),
        editMessage: (request): Promise<boolean> => this.editMessage(request),
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
    request: SendMessageToChannelRequest,
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
    _request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }
  protected editMessage(_request: EditMessageRequest): Promise<boolean> {
    return Promise.resolve(false);
  }
  protected supportsMessageEditing(): boolean {
    return false;
  }
  protected async onProgressUpdate(_event: JobProgressEvent): Promise<void> {}

  /** @internal */
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

  /** @internal */
  protected isFileSizeAllowed(size: number): boolean {
    return size <= 100_000;
  }

  /** @internal */
  protected formatFileUploadMessage(filename: string, content: string): string {
    return `User uploaded a file "${filename}":\n\n${content}`;
  }

  /** @internal */
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

  /** @internal */
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
