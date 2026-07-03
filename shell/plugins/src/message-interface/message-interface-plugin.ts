import { InterfacePlugin } from "../interface/interface-plugin";
import type { InterfacePluginContext } from "../interface/context";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import type { AgentResponse, StructuredChatCard } from "../contracts/agent";
import type {
  PermissionLookupContext,
  UserPermissionLevel,
} from "@brains/templates";
import type { BaseJobTrackingInfo } from "../interfaces";
import {
  setupProgressHandler,
  formatCompletionMessage,
  formatProgressMessage,
} from "./progress-handler";
import {
  setupToolActivityHandler,
  type ToolActivityEvent,
} from "./tool-event-handler";
import {
  responseHasPendingConfirmationForTool,
  toToolStatusUpdate,
  type ToolStatusUpdate,
} from "./tool-status";
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

export type MessageInterfaceOutput =
  | string
  | {
      card: unknown;
      fallbackText?: string;
    };

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

export interface SendMessageToChannelRequest {
  /** The channel/room to send to (null for single-channel interfaces like CLI) */
  channelId: string | null;
  /** The message or structured output to send */
  message: MessageInterfaceOutput;
}

export type SendMessageWithIdRequest = SendMessageToChannelRequest;

export interface EditMessageRequest {
  channelId: string | null;
  messageId: string;
  newMessage: MessageInterfaceOutput;
}

/**
 * Tracked progress message for editing
 * Maps job/batch ID to the message ID used for progress updates
 */
interface ProgressMessageTracking {
  messageId: string;
  channelId: string;
  lastUpdate: number; // Timestamp of last update (for throttling)
}

/**
 * Minimum time between progress message edits (in ms)
 * Prevents hitting Matrix rate limits while still providing responsive feedback
 */
const PROGRESS_EDIT_THROTTLE_MS = 500;

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
 * Subclasses must implement:
 * - sendMessageToChannel(): Send a message to a specific channel
 * - onProgressUpdate(): Handle progress updates (optional override)
 */
export abstract class MessageInterfacePlugin<
  TConfig,
  TConfigInput,
  TTrackingInfo extends MessageJobTrackingInfo = MessageJobTrackingInfo,
> extends InterfacePlugin<TConfig, TConfigInput, TTrackingInfo> {
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
   * Track progress events for UI state
   * Key: event ID, Value: latest event data
   */
  protected progressEvents = new Map<string, JobProgressEvent>();

  /**
   * Send a message to a specific channel
   * Must be implemented by each interface
   */
  protected abstract sendMessageToChannel(
    request: SendMessageToChannelRequest,
  ): void;

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

  /**
   * Optional callback for progress updates (for UI components)
   */
  protected progressCallback?: (events: JobProgressEvent[]) => void;

  /**
   * Track if we're processing user input
   * When true, completion messages are buffered until processing ends
   */
  private isProcessingInput = false;

  /**
   * Current channel being processed - for routing progress messages
   */
  private currentChannelId: string | null = null;

  /**
   * Buffer for completion messages received during input processing
   * These are flushed after the agent response is sent
   * Each entry includes the message and target channel
   */
  private bufferedCompletionMessages: Array<{
    message: MessageInterfaceOutput;
    channelId: string | null;
  }> = [];

  /**
   * Track progress messages for editing
   * Maps rootJobId to the message tracking info
   * Used for updating progress messages rather than sending new ones
   */
  private progressMessageTracking = new Map<string, ProgressMessageTracking>();

  /**
   * Track agent response messages for editing on job completion
   * Maps jobId to the message tracking info
   */
  private agentResponseTracking = new Map<string, ProgressMessageTracking>();

  /**
   * Tool completions whose final status depends on the agent response.
   * Keyed by interface/conversation/tool so failed retries clear stale state.
   */
  private pendingToolCompletions = new Map<string, ToolActivityEvent>();

  /**
   * Register progress callback for reactive UI updates
   */
  public registerProgressCallback(
    callback: (events: JobProgressEvent[]) => void,
  ): void {
    this.progressCallback = callback;
    // Send current state immediately
    const events = Array.from(this.progressEvents.values()).filter(
      (e) => e.status === "processing",
    );
    callback(events);
  }

  /**
   * Unregister progress callback
   */
  public unregisterProgressCallback(): void {
    delete this.progressCallback;
  }

  /**
   * Track an agent response message for editing on job completion
   * Call this when sending an agent response that contains async job IDs
   * @param jobId - The job ID from the tool result
   * @param messageId - The message ID returned by the messaging system
   * @param channelId - The channel the message was sent to
   */
  protected trackAgentResponseForJob(
    jobId: string,
    messageId: string,
    channelId: string,
  ): void {
    this.agentResponseTracking.set(jobId, {
      messageId,
      channelId,
      lastUpdate: Date.now(),
    });
    this.logger.debug("Tracking agent response for job", {
      jobId,
      messageId,
      channelId,
    });
  }

  /**
   * Lifecycle hook - sets up progress subscription
   */
  protected override async onRegister(
    context: InterfacePluginContext,
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

  /**
   * Default progress event handler
   * - Updates progress state for UI
   * - Sends/edits progress messages (if supported)
   * - Sends completion/failure messages to the appropriate channel
   * - Cleans up after delay
   */
  protected override async handleProgressEvent(
    event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    if (!this.shouldHandleProgressEvent(event)) {
      return;
    }

    this.updateProgressState(event);

    // Only use explicit channelId - background jobs without channelId should not
    // send messages to any chat room (prevents rate limiting from many concurrent jobs)
    const targetChannelId = event.metadata.channelId ?? null;
    const rootJobId = event.metadata.rootJobId;

    const handledByTrackedAgentResponse = await this.handleProcessingProgress(
      event,
      targetChannelId,
      rootJobId,
    );
    if (handledByTrackedAgentResponse) {
      return;
    }

    if (event.status === "completed" || event.status === "failed") {
      await this.handleTerminalProgress(event, targetChannelId, rootJobId);
    }

    // Allow subclasses to add custom handling
    await this.onProgressUpdate(event);

    this.logProgressProcessed(event);
  }

  private shouldHandleProgressEvent(event: JobProgressEvent): boolean {
    // Filter: only handle events for this interface type.
    // If interfaceType is specified in metadata, only matching interfaces should handle it.
    const eventInterfaceType = event.metadata.interfaceType;
    return !eventInterfaceType || eventInterfaceType === this.id;
  }

  private updateProgressState(event: JobProgressEvent): void {
    this.progressEvents.set(event.id, event);
    this.notifyProgressCallback();
  }

  /**
   * Handle processing updates. Returns true when a tracked agent response handled
   * the update and the legacy flow should stop immediately.
   */
  private async handleProcessingProgress(
    event: JobProgressEvent,
    targetChannelId: string | null,
    rootJobId: string,
  ): Promise<boolean> {
    if (event.status !== "processing" || !this.supportsMessageEditing()) {
      return false;
    }

    // If we have agent response tracking for this job, edit that response with
    // progress and stop to preserve the previous early-return behavior.
    const agentTracking = this.agentResponseTracking.get(event.id);
    if (agentTracking) {
      await this.editTrackedProgressMessage(event, agentTracking);
      return true;
    }

    const progressMessage = this.formatProgressOutput(event);
    const existingTracking = this.progressMessageTracking.get(rootJobId);
    const now = Date.now();

    if (existingTracking) {
      // Throttle updates to prevent rate limiting.
      if (now - existingTracking.lastUpdate >= PROGRESS_EDIT_THROTTLE_MS) {
        await this.editMessage({
          channelId: existingTracking.channelId,
          messageId: existingTracking.messageId,
          newMessage: progressMessage,
        });
        existingTracking.lastUpdate = now;
      }
    } else if (targetChannelId && !this.isProcessingInput) {
      await this.sendInitialProgressMessage(
        rootJobId,
        targetChannelId,
        progressMessage,
        now,
      );
    }

    return false;
  }

  private async editTrackedProgressMessage(
    event: JobProgressEvent,
    tracking: ProgressMessageTracking,
  ): Promise<void> {
    const now = Date.now();
    if (now - tracking.lastUpdate < PROGRESS_EDIT_THROTTLE_MS) {
      return;
    }

    await this.editMessage({
      channelId: tracking.channelId,
      messageId: tracking.messageId,
      newMessage: this.formatProgressOutput(event),
    });
    tracking.lastUpdate = now;
  }

  private async sendInitialProgressMessage(
    rootJobId: string,
    targetChannelId: string,
    progressMessage: MessageInterfaceOutput,
    now: number,
  ): Promise<void> {
    // Only send NEW progress messages after agent response is sent.
    // This ensures the agent response appears first.
    const messageId = await this.sendMessageWithId({
      channelId: targetChannelId,
      message: progressMessage,
    });
    if (!messageId) {
      return;
    }

    this.progressMessageTracking.set(rootJobId, {
      messageId,
      channelId: targetChannelId,
      lastUpdate: now,
    });
    this.logger.debug("Tracking progress message", {
      rootJobId,
      messageId,
      channelId: targetChannelId,
    });
  }

  private async handleTerminalProgress(
    event: JobProgressEvent,
    targetChannelId: string | null,
    rootJobId: string,
  ): Promise<void> {
    const completionMessage = this.formatCompletionOutput(event);
    const progressTracking = this.progressMessageTracking.get(rootJobId);
    const agentTracking = this.agentResponseTracking.get(event.id);

    this.logger.debug("Completion event received", {
      eventId: event.id,
      rootJobId,
      hasProgressTracking: !!progressTracking,
      hasAgentTracking: !!agentTracking,
      supportsEditing: this.supportsMessageEditing(),
    });

    if (this.supportsMessageEditing()) {
      await this.updateTrackedCompletion(
        event,
        completionMessage,
        progressTracking,
        agentTracking,
        rootJobId,
      );
    }

    // If no tracked messages to edit, send as new message.
    // Only send if we have a target channel (jobs without explicit channelId are silent).
    if (!progressTracking && !agentTracking && targetChannelId) {
      this.sendOrBufferCompletionMessage(completionMessage, targetChannelId);
    }

    this.scheduleProgressCleanup(event.id);
  }

  private async updateTrackedCompletion(
    event: JobProgressEvent,
    completionMessage: MessageInterfaceOutput,
    progressTracking: ProgressMessageTracking | undefined,
    agentTracking: ProgressMessageTracking | undefined,
    rootJobId: string,
  ): Promise<void> {
    // Prefer editing the agent response message (for async jobs).
    // This updates "queued" messages to show actual completion.
    if (agentTracking) {
      await this.editMessage({
        channelId: agentTracking.channelId,
        messageId: agentTracking.messageId,
        newMessage: completionMessage,
      });
      this.agentResponseTracking.delete(event.id);
      // Also clean up any progress tracking without sending duplicate.
      if (progressTracking) {
        this.progressMessageTracking.delete(rootJobId);
      }
      return;
    }

    if (progressTracking) {
      await this.editMessage({
        channelId: progressTracking.channelId,
        messageId: progressTracking.messageId,
        newMessage: completionMessage,
      });
      this.progressMessageTracking.delete(rootJobId);
    }
  }

  private sendOrBufferCompletionMessage(
    message: MessageInterfaceOutput,
    channelId: string,
  ): void {
    // Buffer completion messages while processing input.
    // This ensures agent response appears before completion messages.
    if (this.isProcessingInput) {
      this.bufferedCompletionMessages.push({ message, channelId });
      return;
    }

    this.sendMessageToChannel({ channelId, message });
  }

  private scheduleProgressCleanup(eventId: string): void {
    setTimeout(() => {
      this.progressEvents.delete(eventId);
      this.notifyProgressCallback();
    }, 500);
  }

  private logProgressProcessed(event: JobProgressEvent): void {
    this.logger.debug("Progress event processed", {
      eventId: event.id,
      status: event.status,
      operationType: event.metadata.operationType,
      targetChannel: event.metadata.channelId,
    });
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

  /**
   * Derive semantic status updates from raw tool activity events.
   */
  protected async handleToolActivityEvent(
    event: ToolActivityEvent,
  ): Promise<void> {
    if (event.interfaceType !== this.id) {
      return;
    }

    switch (event.type) {
      case "tool:invoking":
        this.pendingToolCompletions.delete(this.getToolCompletionKey(event));
        await this.handleToolStatusUpdate(toToolStatusUpdate(event, "running"));
        return;
      case "tool:completed":
        if (this.isProcessingInput) {
          this.pendingToolCompletions.set(
            this.getToolCompletionKey(event),
            event,
          );
          return;
        }
        await this.handleToolStatusUpdate(
          toToolStatusUpdate(event, "completed"),
        );
        return;
      case "tool:failed":
        this.pendingToolCompletions.delete(this.getToolCompletionKey(event));
        await this.handleToolStatusUpdate(toToolStatusUpdate(event, "failed"));
        return;
    }
  }

  /**
   * Override point for transport-specific rendering of semantic tool statuses.
   */
  protected async handleToolStatusUpdate(
    _update: ToolStatusUpdate,
  ): Promise<void> {
    // Default: no additional handling
  }

  /**
   * Resolve deferred tool completions after an agent response is available.
   */
  protected async handleAgentResponseToolStatuses(
    response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
    conversationId: string,
  ): Promise<void> {
    if (this.pendingToolCompletions.size === 0) {
      return;
    }

    const completions = Array.from(this.pendingToolCompletions.values()).filter(
      (event) =>
        event.interfaceType === this.id &&
        event.conversationId === conversationId,
    );

    for (const event of completions) {
      this.pendingToolCompletions.delete(this.getToolCompletionKey(event));
      const state = responseHasPendingConfirmationForTool(
        response,
        event.toolName,
      )
        ? "awaiting-approval"
        : "completed";
      await this.handleToolStatusUpdate(toToolStatusUpdate(event, state));
    }
  }

  private getToolCompletionKey(event: ToolActivityEvent): string {
    return `${event.interfaceType}:${event.conversationId}:${event.toolName}`;
  }

  /**
   * Notify progress callback with current events
   */
  private notifyProgressCallback(): void {
    if (this.progressCallback) {
      const events = Array.from(this.progressEvents.values());
      this.progressCallback(events);
    }
  }

  /**
   * Get all current progress events
   */
  public getProgressEvents(): JobProgressEvent[] {
    return Array.from(this.progressEvents.values());
  }

  /**
   * Get processing events only (for status displays)
   */
  public getActiveProgressEvents(): JobProgressEvent[] {
    return Array.from(this.progressEvents.values()).filter(
      (e) => e.status === "processing",
    );
  }

  /**
   * Start processing user input from a specific channel
   * Completion messages will be buffered until endProcessingInput() is called
   * This ensures agent responses appear before job completion messages
   *
   * @param channelId - The channel/room being processed (null for CLI)
   */
  public startProcessingInput(channelId: string | null = null): void {
    this.isProcessingInput = true;
    this.currentChannelId = channelId;
  }

  /**
   * End processing user input and flush buffered completion messages
   * Should be called after sending the agent response
   */
  public endProcessingInput(): void {
    this.isProcessingInput = false;

    // Flush buffered completion messages to their respective channels
    for (const { message, channelId } of this.bufferedCompletionMessages) {
      this.sendMessageToChannel({ channelId, message });
    }
    this.bufferedCompletionMessages = [];

    // Clear channel context
    this.currentChannelId = null;
  }

  /**
   * Get the current channel ID being processed
   */
  protected getCurrentChannelId(): string | null {
    return this.currentChannelId;
  }
}
