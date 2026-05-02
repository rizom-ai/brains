import { InterfacePlugin } from "../interface/interface-plugin";
import type { InterfacePluginContext } from "../interface/context";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import type { BaseJobTrackingInfo } from "../interfaces";
import {
  setupProgressHandler,
  formatCompletionMessage,
  formatProgressMessage,
} from "./progress-handler";
import {
  extractCaptureableUrls,
  formatFileUploadMessage,
  isFileSizeAllowed,
  isUploadableTextFile,
  urlCaptureConfigSchema,
} from "./message-content-utils";

export { urlCaptureConfigSchema };

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
  TConfig = unknown,
  TTrackingInfo extends MessageJobTrackingInfo = MessageJobTrackingInfo,
> extends InterfacePlugin<TConfig, TTrackingInfo> {
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
  ): Promise<void> {
    if (!this.context) return;
    const userPermissionLevel = this.context.permissions.getUserLevel(
      interfaceType,
      authorId,
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
   * @param channelId - The channel/room to send to (null for single-channel interfaces like CLI)
   * @param message - The message to send
   */
  protected abstract sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void;

  /**
   * Send a message and return its ID for later editing
   * Override to enable progress message editing (default: not supported)
   * @returns Promise<string> message ID, or undefined if not supported
   */
  protected sendMessageWithId(
    _channelId: string | null,
    _message: string,
  ): Promise<string | undefined> {
    // Default: message editing not supported
    return Promise.resolve(undefined);
  }

  /**
   * Edit a previously sent message
   * Override to enable progress message editing (default: not supported)
   * @returns Promise<boolean> true if edit succeeded
   */
  protected editMessage(
    _channelId: string,
    _messageId: string,
    _newMessage: string,
  ): Promise<boolean> {
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
    message: string;
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

    this.logger.debug("Message interface registered with progress handler", {
      id: this.id,
    });
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

    const progressMessage = formatProgressMessage(event);
    const existingTracking = this.progressMessageTracking.get(rootJobId);
    const now = Date.now();

    if (existingTracking) {
      // Throttle updates to prevent rate limiting.
      if (now - existingTracking.lastUpdate >= PROGRESS_EDIT_THROTTLE_MS) {
        await this.editMessage(
          existingTracking.channelId,
          existingTracking.messageId,
          progressMessage,
        );
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

    await this.editMessage(
      tracking.channelId,
      tracking.messageId,
      formatProgressMessage(event),
    );
    tracking.lastUpdate = now;
  }

  private async sendInitialProgressMessage(
    rootJobId: string,
    targetChannelId: string,
    progressMessage: string,
    now: number,
  ): Promise<void> {
    // Only send NEW progress messages after agent response is sent.
    // This ensures the agent response appears first.
    const messageId = await this.sendMessageWithId(
      targetChannelId,
      progressMessage,
    );
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
    const completionMessage = formatCompletionMessage(event);
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
    completionMessage: string,
    progressTracking: ProgressMessageTracking | undefined,
    agentTracking: ProgressMessageTracking | undefined,
    rootJobId: string,
  ): Promise<void> {
    // Prefer editing the agent response message (for async jobs).
    // This updates "queued" messages to show actual completion.
    if (agentTracking) {
      await this.editMessage(
        agentTracking.channelId,
        agentTracking.messageId,
        completionMessage,
      );
      this.agentResponseTracking.delete(event.id);
      // Also clean up any progress tracking without sending duplicate.
      if (progressTracking) {
        this.progressMessageTracking.delete(rootJobId);
      }
      return;
    }

    if (progressTracking) {
      await this.editMessage(
        progressTracking.channelId,
        progressTracking.messageId,
        completionMessage,
      );
      this.progressMessageTracking.delete(rootJobId);
    }
  }

  private sendOrBufferCompletionMessage(
    message: string,
    channelId: string,
  ): void {
    // Buffer completion messages while processing input.
    // This ensures agent response appears before completion messages.
    if (this.isProcessingInput) {
      this.bufferedCompletionMessages.push({ message, channelId });
      return;
    }

    this.sendMessageToChannel(channelId, message);
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
   * Override point for custom progress handling
   * Called after default handling for each progress event
   */
  protected async onProgressUpdate(_event: JobProgressEvent): Promise<void> {
    // Default: no additional handling
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
      this.sendMessageToChannel(channelId, message);
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
