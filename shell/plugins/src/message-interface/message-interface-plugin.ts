import { InterfacePlugin } from "../interface/interface-plugin";
import type { InterfacePluginContext } from "../interface/context";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import type { BaseJobTrackingInfo } from "../interfaces";
import {
  setupProgressHandler,
  formatCompletionMessage,
  formatProgressMessage,
} from "./progress-handler";

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
  /** Max file size for text uploads (100KB) */
  protected static readonly MAX_FILE_UPLOAD_SIZE = 100_000;

  /** Allowed text-based file extensions */
  private static readonly TEXT_FILE_EXTENSIONS = [".md", ".txt", ".markdown"];

  /** Allowed text-based MIME types */
  private static readonly TEXT_MIME_TYPES = [
    "text/plain",
    "text/markdown",
    "text/x-markdown",
  ];

  /**
   * Check if a file is a supported text file for upload
   */
  protected isUploadableTextFile(filename: string, mimetype?: string): boolean {
    if (
      mimetype &&
      MessageInterfacePlugin.TEXT_MIME_TYPES.some((t) => mimetype.startsWith(t))
    ) {
      return true;
    }
    return MessageInterfacePlugin.TEXT_FILE_EXTENSIONS.some((ext) =>
      filename.toLowerCase().endsWith(ext),
    );
  }

  /**
   * Validate file size for upload
   */
  protected isFileSizeAllowed(size: number): boolean {
    return size <= MessageInterfacePlugin.MAX_FILE_UPLOAD_SIZE;
  }

  /**
   * Format uploaded file content as an agent message
   */
  protected formatFileUploadMessage(filename: string, content: string): string {
    return `User uploaded a file "${filename}":\n\n${content}`;
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
    // Filter: only handle events for this interface type
    // If interfaceType is specified in metadata, only matching interfaces should handle it
    const eventInterfaceType = event.metadata.interfaceType;
    if (eventInterfaceType && eventInterfaceType !== this.id) {
      // This event is for a different interface - ignore it
      return;
    }

    // Update progress state
    this.progressEvents.set(event.id, event);

    // Notify UI callback
    this.notifyProgressCallback();

    // Get channel from event metadata
    // Only use explicit channelId - background jobs without channelId should not
    // send messages to any chat room (prevents rate limiting from many concurrent jobs)
    const targetChannelId = event.metadata.channelId ?? null;
    const rootJobId = event.metadata.rootJobId;

    // Handle processing status - send or edit progress message
    if (event.status === "processing" && this.supportsMessageEditing()) {
      // Check if we have agent response tracking for this job
      // If so, edit the agent response with progress (throttled)
      const agentTracking = this.agentResponseTracking.get(event.id);
      if (agentTracking) {
        const now = Date.now();
        if (now - agentTracking.lastUpdate >= PROGRESS_EDIT_THROTTLE_MS) {
          const progressMessage = formatProgressMessage(event);
          await this.editMessage(
            agentTracking.channelId,
            agentTracking.messageId,
            progressMessage,
          );
          agentTracking.lastUpdate = now;
        }
        return;
      }

      const progressMessage = formatProgressMessage(event);
      const existingTracking = this.progressMessageTracking.get(rootJobId);
      const now = Date.now();

      if (existingTracking) {
        // Throttle updates to prevent rate limiting
        if (now - existingTracking.lastUpdate >= PROGRESS_EDIT_THROTTLE_MS) {
          // Edit existing progress message
          await this.editMessage(
            existingTracking.channelId,
            existingTracking.messageId,
            progressMessage,
          );
          existingTracking.lastUpdate = now;
        }
      } else if (targetChannelId && !this.isProcessingInput) {
        // Only send NEW progress messages after agent response is sent
        // This ensures the agent response appears first
        const messageId = await this.sendMessageWithId(
          targetChannelId,
          progressMessage,
        );
        if (messageId) {
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
      }
    }

    // Handle completion/failure - send/edit final message
    if (event.status === "completed" || event.status === "failed") {
      const completionMessage = formatCompletionMessage(event);

      // Check if we have a tracked progress message to edit
      const progressTracking = this.progressMessageTracking.get(rootJobId);
      // Check if we have a tracked agent response to edit (for jobId)
      const agentTracking = this.agentResponseTracking.get(event.id);

      this.logger.debug("Completion event received", {
        eventId: event.id,
        rootJobId,
        hasProgressTracking: !!progressTracking,
        hasAgentTracking: !!agentTracking,
        supportsEditing: this.supportsMessageEditing(),
      });

      if (this.supportsMessageEditing()) {
        // Prefer editing the agent response message (for async jobs)
        // This updates "queued" messages to show actual completion
        if (agentTracking) {
          await this.editMessage(
            agentTracking.channelId,
            agentTracking.messageId,
            completionMessage,
          );
          this.agentResponseTracking.delete(event.id);
          // Also clean up any progress tracking without sending duplicate
          if (progressTracking) {
            this.progressMessageTracking.delete(rootJobId);
          }
        } else if (progressTracking) {
          // No agent tracking - edit the progress message instead
          await this.editMessage(
            progressTracking.channelId,
            progressTracking.messageId,
            completionMessage,
          );
          this.progressMessageTracking.delete(rootJobId);
        }
      }

      // If no tracked messages to edit, send as new message
      // Only send if we have a target channel (jobs without explicit channelId are silent)
      if (!progressTracking && !agentTracking && targetChannelId) {
        // Buffer completion messages while processing input
        // This ensures agent response appears before completion messages
        if (this.isProcessingInput) {
          this.bufferedCompletionMessages.push({
            message: completionMessage,
            channelId: targetChannelId,
          });
        } else {
          this.sendMessageToChannel(targetChannelId, completionMessage);
        }
      }

      // Clean up progress state after delay
      setTimeout(() => {
        this.progressEvents.delete(event.id);
        this.notifyProgressCallback();
      }, 500);
    }

    // Allow subclasses to add custom handling
    await this.onProgressUpdate(event);

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
