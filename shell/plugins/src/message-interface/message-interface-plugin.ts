import { InterfacePlugin } from "../interface/interface-plugin";
import {
  createMessageInterfacePluginContext,
  type MessageInterfacePluginContext,
} from "../interface/context";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import type { AgentResponse, StructuredChatCard } from "../contracts/agent";
import type {
  PermissionLookupContext,
  UserPermissionLevel,
} from "@brains/templates";
import type {
  BaseJobTrackingInfo,
  IShell,
  PluginRegistrationContext,
} from "../interfaces";
import {
  setupProgressHandler,
  formatCompletionMessage,
  formatProgressMessage,
} from "./progress-handler";
import {
  setupToolActivityHandler,
  type ToolActivityEvent,
} from "./tool-event-handler";
import type { ToolStatusUpdate } from "./tool-status";
import {
  ProgressMessageCoordinator,
  type EditMessageRequest,
  type MessageInterfaceOutput,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
} from "./progress-message-coordinator";
import type { Logger } from "@brains/utils/logger";
import {
  extractCaptureableUrls,
  formatFileUploadMessage,
  isFileSizeAllowed,
  isLikelyTextContent,
  isUploadableTextFile,
  maxFileUploadBytes,
  urlCaptureConfigSchema,
} from "./message-content-utils";
import {
  canReceiveNativeArtifactFile,
  resolveMessageArtifactAccess,
} from "./artifact-access";
import {
  getArtifactEntityFilename,
  parseArtifactDataUrl,
  resolveArtifactEntityRefFromCard,
} from "./artifact-entity";

export { urlCaptureConfigSchema };

export interface NativeArtifactFile {
  cardId: string;
  data: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface NativeArtifactDelivery {
  files: NativeArtifactFile[];
  deniedCardIds: Set<string>;
}

export type {
  EditMessageRequest,
  MessageInterfaceOutput,
  SendMessageToChannelRequest,
  SendMessageWithIdRequest,
} from "./progress-message-coordinator";

/**
 * Job tracking info for message-based interfaces
 * Extends base with message-specific routing info
 */
export interface MessageJobTrackingInfo extends BaseJobTrackingInfo {
  messageId?: string; // For message editing (optional)
  channelId?: string; // For routing context (optional)
}

/**
 * Base class for message-based interface plugins (Matrix, CLI, etc.)
 *
 * Designed for channel-based interfaces (Matrix rooms, Slack channels, etc.)
 * where messages are routed to specific channels. CLI is the simpler case
 * with a single implicit channel.
 *
 * Provides common functionality for interfaces that:
 * - Display progress events to users
 * - Send completion/failure notifications
 * - Track jobs for progress routing
 * - Buffer completion messages during input processing
 *
 * Conversational subclasses implement sendMessageToChannel() to deliver replies.
 * Outbound-only interfaces may instead expose registered delivery providers.
 * Subclasses may override onProgressUpdate() to handle progress updates.
 */
export abstract class MessageInterfacePlugin<
  TConfig,
  TConfigInput,
  TTrackingInfo extends MessageJobTrackingInfo = MessageJobTrackingInfo,
> extends InterfacePlugin<TConfig, TConfigInput, TTrackingInfo> {
  protected override createContext(
    shell: IShell,
    registrationContext?: PluginRegistrationContext,
  ): MessageInterfacePluginContext {
    return createMessageInterfacePluginContext(
      shell,
      this.id,
      registrationContext,
    );
  }

  /**
   * Check if a file is a supported text file for upload
   */
  protected isUploadableTextFile(filename: string, mimetype?: string): boolean {
    return isUploadableTextFile(filename, mimetype);
  }

  /**
   * Validate file size for upload
   */
  protected isFileSizeAllowed(size: number): boolean {
    return isFileSizeAllowed(size);
  }

  /**
   * Format uploaded file content as an agent message
   */
  protected formatFileUploadMessage(filename: string, content: string): string {
    return formatFileUploadMessage(filename, content);
  }

  /**
   * Maximum size (in bytes) allowed for an uploaded text file
   */
  protected getMaxFileUploadBytes(): number {
    return maxFileUploadBytes;
  }

  /**
   * Check that uploaded bytes are decodable text rather than binary content
   */
  protected isLikelyTextContent(bytes: Uint8Array): boolean {
    return isLikelyTextContent(bytes);
  }

  /**
   * Resolve generated attachment cards into native files for transports that can
   * upload inline files. Also returns permission-denied card ids so callers can
   * suppress inaccessible artifact metadata.
   */
  protected async resolveNativeArtifactDelivery(input: {
    cards: StructuredChatCard[] | undefined;
    userPermissionLevel: UserPermissionLevel;
    displayBaseUrl?: string | undefined;
    maxBytes?: number | undefined;
  }): Promise<NativeArtifactDelivery> {
    const files: NativeArtifactFile[] = [];
    const deniedCardIds = new Set<string>();
    if (!this.context || !input.cards) return { files, deniedCardIds };
    const context = this.context;

    for (const card of input.cards) {
      if (card.kind !== "attachment") continue;
      const entityRef = resolveArtifactEntityRefFromCard(
        card,
        input.displayBaseUrl,
      );
      if (!entityRef) continue;

      const access = await resolveMessageArtifactAccess({
        entityRef,
        userLevel: input.userPermissionLevel,
        getEntity: (ref) => context.entityService.getEntity(ref),
        getVisibleEntity: (ref, visibilityScope) =>
          context.entityService.getEntity({ ...ref, visibilityScope }),
      });
      if (access.status === "denied") {
        deniedCardIds.add(card.id);
        continue;
      }
      if (access.status !== "visible") continue;
      if (!canReceiveNativeArtifactFile(input.userPermissionLevel)) continue;
      if (typeof access.entity.content !== "string") continue;

      const parsed = parseArtifactDataUrl(
        entityRef.entityType,
        access.entity.content,
      );
      if (!parsed) continue;
      if (
        input.maxBytes !== undefined &&
        parsed.data.byteLength > input.maxBytes
      ) {
        this.logger.debug("Skipping oversized native artifact upload", {
          cardId: card.id,
          sizeBytes: parsed.data.byteLength,
        });
        continue;
      }

      files.push({
        cardId: card.id,
        data: new Uint8Array(parsed.data),
        filename:
          card.attachment.filename ??
          getArtifactEntityFilename(
            access.entity.metadata,
            entityRef.id,
            entityRef.entityType,
            parsed.mimeType,
          ),
        mimeType: parsed.mimeType,
      });
    }

    return { files, deniedCardIds };
  }

  // ── URL capture ──

  /**
   * Extract HTTP(S) URLs from message content, filtering out blocked domains.
   * Used by interfaces that support URL auto-capture.
   */
  protected extractCaptureableUrls(
    content: string,
    blockedDomains: string[],
  ): string[] {
    return extractCaptureableUrls(content, blockedDomains);
  }

  /**
   * Save a URL via the agent (delegates to system_create for entityType link).
   * Silent — no reply sent. Uses a dedicated conversation ID to avoid polluting
   * the user's chat history.
   */
  protected async captureUrlViaAgent(
    url: string,
    channelId: string,
    authorId: string,
    interfaceType: string,
    permissionContext?: PermissionLookupContext,
  ): Promise<void> {
    if (!this.context) return;
    const userPermissionLevel = this.context.permissions.getUserLevel(
      interfaceType,
      authorId,
      permissionContext,
    );
    await this.context.agent.chat(
      `Save this link: ${url}`,
      `links-${channelId}`,
      {
        userPermissionLevel,
        interfaceType,
        channelId,
      },
    );
  }

  /**
   * All progress bookkeeping — live events, editable messages, deferred tool
   * completions, and the completion buffer. The transport methods below are
   * this class's remaining responsibility.
   */
  protected readonly progress: ProgressMessageCoordinator =
    new ProgressMessageCoordinator({
      interfaceId: (): string => this.id,
      logger: (): Logger => this.logger,
      sendMessageToChannel: (request): void =>
        this.sendMessageToChannel(request),
      sendMessageWithId: (request): Promise<string | undefined> =>
        this.sendMessageWithId(request),
      editMessage: (request): Promise<boolean> => this.editMessage(request),
      supportsMessageEditing: (): boolean => this.supportsMessageEditing(),
      formatProgressOutput: (event): MessageInterfaceOutput =>
        this.formatProgressOutput(event),
      formatCompletionOutput: (event): MessageInterfaceOutput =>
        this.formatCompletionOutput(event),
      onProgressUpdate: (event): Promise<void> => this.onProgressUpdate(event),
      handleToolStatusUpdate: (update): Promise<void> =>
        this.handleToolStatusUpdate(update),
    });

  /**
   * Send an agent message to a specific channel.
   * Inbound/conversational interfaces override this. Outbound-only interfaces
   * may rely exclusively on their registered delivery provider.
   */
  protected sendMessageToChannel(_request: SendMessageToChannelRequest): void {
    return;
  }

  /**
   * Send a message and return its ID for later editing
   * Override to enable progress message editing (default: not supported)
   * @returns Promise<string> message ID, or undefined if not supported
   */
  protected sendMessageWithId(
    _request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    // Default: message editing not supported
    return Promise.resolve(undefined);
  }

  /**
   * Edit a previously sent message
   * Override to enable progress message editing (default: not supported)
   * @returns Promise<boolean> true if edit succeeded
   */
  protected editMessage(_request: EditMessageRequest): Promise<boolean> {
    // Default: message editing not supported
    return Promise.resolve(false);
  }

  /**
   * Check if this interface supports message editing for progress updates
   */
  protected supportsMessageEditing(): boolean {
    return false;
  }

  /** Register progress callback for reactive UI updates. */
  public registerProgressCallback(
    callback: (events: JobProgressEvent[]) => void,
  ): void {
    this.progress.registerProgressCallback(callback);
  }

  public unregisterProgressCallback(): void {
    this.progress.unregisterProgressCallback();
  }

  /** Whether a reactive UI is currently attached. */
  protected hasProgressCallback(): boolean {
    return this.progress.hasProgressCallback();
  }

  /**
   * Track an agent response message for editing on job completion.
   * Call this when sending an agent response that contains async job IDs.
   */
  protected trackAgentResponseForJob(
    jobId: string,
    messageId: string,
    channelId: string,
  ): void {
    this.progress.trackAgentResponseForJob(jobId, messageId, channelId);
  }

  /**
   * Lifecycle hook - sets up progress subscription
   */
  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // Setup progress event subscription
    setupProgressHandler(context, {
      onProgress: async (event, eventContext) => {
        await this.handleProgressEvent(event, eventContext);
      },
      onError: (error) => {
        this.logger.error("Error handling progress event", {
          error,
          interfaceId: this.id,
        });
      },
      onInvalidSchema: () => {
        this.logger.warn("Invalid progress event schema", {
          interfaceId: this.id,
        });
      },
    });

    setupToolActivityHandler(context, {
      onToolActivity: async (event) => {
        await this.handleToolActivityEvent(event);
      },
      onError: (error) => {
        this.logger.error("Error handling tool activity event", {
          error,
          interfaceId: this.id,
        });
      },
      onInvalidSchema: () => {
        this.logger.warn("Invalid tool activity event schema", {
          interfaceId: this.id,
        });
      },
    });

    this.logger.debug(
      "Message interface registered with progress and tool handlers",
      {
        id: this.id,
      },
    );
  }

  /** Interrupt delayed cleanup before plugin-owned state is released. */
  protected override async onShutdown(): Promise<void> {
    await this.progress.close();
    await super.onShutdown();
  }

  /**
   * Default progress event handler. All bookkeeping lives in the coordinator;
   * this only adapts the base class's signature.
   */
  protected override async handleProgressEvent(
    event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    await this.progress.handleProgressEvent(event);
  }
  /**
   * Format in-flight progress output. Interfaces may override to render native
   * cards/components while preserving the shared progress lifecycle.
   */
  protected formatProgressOutput(
    event: JobProgressEvent,
  ): MessageInterfaceOutput {
    return formatProgressMessage(event);
  }

  /**
   * Format terminal progress output. Interfaces may override to render native
   * cards/components while preserving the shared progress lifecycle.
   */
  protected formatCompletionOutput(
    event: JobProgressEvent,
  ): MessageInterfaceOutput {
    return formatCompletionMessage(event);
  }

  /**
   * Override point for custom progress handling
   * Called after default handling for each progress event
   */
  protected async onProgressUpdate(_event: JobProgressEvent): Promise<void> {
    // Default: no additional handling
  }

  /** Derive semantic status updates from raw tool activity events. */
  protected async handleToolActivityEvent(
    event: ToolActivityEvent,
  ): Promise<void> {
    await this.progress.handleToolActivityEvent(event);
  }

  /**
   * Override point for transport-specific rendering of semantic tool statuses.
   */
  protected async handleToolStatusUpdate(
    _update: ToolStatusUpdate,
  ): Promise<void> {
    // Default: no additional handling
  }

  /** Resolve deferred tool completions after an agent response is available. */
  protected async handleAgentResponseToolStatuses(
    response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
    conversationId: string,
  ): Promise<void> {
    await this.progress.handleAgentResponseToolStatuses(
      response,
      conversationId,
    );
  }
  /** All current progress events. */
  public getProgressEvents(): JobProgressEvent[] {
    return this.progress.getProgressEvents();
  }

  /** Processing events only (for status displays). */
  public getActiveProgressEvents(): JobProgressEvent[] {
    return this.progress.getActiveProgressEvents();
  }

  /**
   * Start processing user input from a specific channel. Completion messages
   * are buffered until endProcessingInput(), so the agent response lands
   * before any job completion message.
   */
  public startProcessingInput(channelId: string | null = null): void {
    this.progress.startProcessingInput(channelId);
  }

  /** End processing and flush buffered completion messages. */
  public endProcessingInput(): void {
    this.progress.endProcessingInput();
  }

  protected getCurrentChannelId(): string | null {
    return this.progress.getCurrentChannelId();
  }
}
