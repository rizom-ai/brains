import { InterfacePlugin } from "../interface/interface-plugin";
import type { InterfacePluginContext } from "../interface/context";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import type { BaseJobTrackingInfo } from "../interfaces";
import {
  setupProgressHandler,
  formatCompletionMessage,
} from "./progress-handler";

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
   */
  private bufferedCompletionMessages: string[] = [];

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
   * - Sends completion/failure messages
   * - Cleans up after delay
   */
  protected override async handleProgressEvent(
    event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // Update progress state
    this.progressEvents.set(event.id, event);

    // Notify UI callback
    this.notifyProgressCallback();

    // Handle completion/failure - send a message to the user
    if (event.status === "completed" || event.status === "failed") {
      const message = formatCompletionMessage(event);

      // Buffer completion messages while processing input
      // This ensures agent response appears before completion messages
      if (this.isProcessingInput) {
        this.bufferedCompletionMessages.push(message);
      } else {
        this.sendMessageToChannel(this.currentChannelId, message);
      }

      // Clean up after delay
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

    // Flush buffered completion messages to the current channel
    for (const message of this.bufferedCompletionMessages) {
      this.sendMessageToChannel(this.currentChannelId, message);
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
