import type { JobProgressEvent } from "@brains/job-queue";
import type { Logger } from "@brains/utils/logger";
import type { AgentResponse } from "../contracts/agent";
import type { ToolActivityEvent } from "./tool-event-handler";
import { KeyedCleanupSupervisor } from "./keyed-cleanup-supervisor";
import {
  responseHasPendingConfirmationForTool,
  toToolStatusUpdate,
  type ToolStatusUpdate,
} from "./tool-status";
import type { MessageInterfaceOutput } from "./index";

const PROGRESS_EDIT_THROTTLE_MS = 500;
const PROGRESS_CLEANUP_DELAY_MS = 500;

interface ProgressMessageTracking {
  messageId: string;
  channelId: string;
  lastUpdate: number; // Timestamp of last update (for throttling)
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
 * Everything the coordinator needs from the interface it drives. Each member
 * is an override point on MessageInterfacePlugin, so a transport customises
 * delivery and rendering without touching progress bookkeeping.
 */
export interface ProgressMessageTransport {
  interfaceId(): string;
  logger(): Logger;
  sendMessageToChannel(request: SendMessageToChannelRequest): void;
  sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined>;
  editMessage(request: EditMessageRequest): Promise<boolean>;
  supportsMessageEditing(): boolean;
  formatProgressOutput(event: JobProgressEvent): MessageInterfaceOutput;
  formatCompletionOutput(event: JobProgressEvent): MessageInterfaceOutput;
  onProgressUpdate(event: JobProgressEvent): Promise<void>;
  handleToolStatusUpdate(update: ToolStatusUpdate): Promise<void>;
}

/**
 * Owns every piece of progress bookkeeping a message interface needs: which
 * events are live, which sent messages may still be edited, which tool
 * completions are waiting on an agent response, and which completion messages
 * must be held back until the agent has replied.
 *
 * Split out of MessageInterfacePlugin so the class keeps only its transport
 * hooks — the state here is bookkeeping, not transport.
 */
export class ProgressMessageCoordinator {
  private readonly transport: ProgressMessageTransport;
  private readonly cleanupSupervisor = new KeyedCleanupSupervisor(
    PROGRESS_CLEANUP_DELAY_MS,
  );

  /** Latest event data, keyed by event id. */
  private readonly progressEvents = new Map<string, JobProgressEvent>();
  /** Progress messages that may still be edited, keyed by rootJobId. */
  private readonly progressMessageTracking = new Map<
    string,
    ProgressMessageTracking
  >();
  /** Agent responses that may still be edited, keyed by jobId. */
  private readonly agentResponseTracking = new Map<
    string,
    ProgressMessageTracking
  >();
  /**
   * Tool completions whose final status depends on the agent response.
   * Keyed by interface/conversation/tool so failed retries clear stale state.
   */
  private readonly pendingToolCompletions = new Map<
    string,
    ToolActivityEvent
  >();

  private progressCallback: ((events: JobProgressEvent[]) => void) | undefined;
  private isProcessingInput = false;
  private currentChannelId: string | null = null;
  private bufferedCompletionMessages: Array<{
    message: MessageInterfaceOutput;
    channelId: string | null;
  }> = [];

  constructor(transport: ProgressMessageTransport) {
    this.transport = transport;
  }

  hasProgressCallback(): boolean {
    return this.progressCallback !== undefined;
  }

  registerProgressCallback(
    callback: (events: JobProgressEvent[]) => void,
  ): void {
    this.progressCallback = callback;
    // Send current state immediately
    callback(this.getActiveProgressEvents());
  }

  unregisterProgressCallback(): void {
    this.progressCallback = undefined;
  }

  getProgressEvents(): JobProgressEvent[] {
    return Array.from(this.progressEvents.values());
  }

  /** Processing events only (for status displays). */
  getActiveProgressEvents(): JobProgressEvent[] {
    return Array.from(this.progressEvents.values()).filter(
      (event) => event.status === "processing",
    );
  }

  /**
   * Track an agent response message for editing on job completion. Call this
   * when sending an agent response that contains async job IDs.
   */
  trackAgentResponseForJob(
    jobId: string,
    messageId: string,
    channelId: string,
  ): void {
    this.agentResponseTracking.set(jobId, {
      messageId,
      channelId,
      lastUpdate: Date.now(),
    });
    this.transport.logger().debug("Tracking agent response for job", {
      jobId,
      messageId,
      channelId,
    });
  }

  /**
   * Start processing user input from a specific channel. Completion messages
   * are buffered until endProcessingInput(), so agent responses land first.
   */
  startProcessingInput(channelId: string | null = null): void {
    this.isProcessingInput = true;
    this.currentChannelId = channelId;
  }

  /** End processing and flush buffered completion messages. */
  endProcessingInput(): void {
    this.isProcessingInput = false;

    for (const { message, channelId } of this.bufferedCompletionMessages) {
      this.transport.sendMessageToChannel({ channelId, message });
    }
    this.bufferedCompletionMessages = [];

    this.currentChannelId = null;
  }

  getCurrentChannelId(): string | null {
    return this.currentChannelId;
  }

  /** Interrupt delayed cleanup and release all bookkeeping. */
  async close(): Promise<void> {
    await this.cleanupSupervisor.close();
    this.progressEvents.clear();
    this.progressMessageTracking.clear();
    this.agentResponseTracking.clear();
    this.pendingToolCompletions.clear();
    this.bufferedCompletionMessages = [];
    this.isProcessingInput = false;
    this.currentChannelId = null;
    this.progressCallback = undefined;
  }

  /**
   * - Updates progress state for UI
   * - Sends/edits progress messages (if supported)
   * - Sends completion/failure messages to the appropriate channel
   * - Cleans up after a delay
   */
  async handleProgressEvent(event: JobProgressEvent): Promise<void> {
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
    await this.transport.onProgressUpdate(event);

    this.logProgressProcessed(event);
  }

  /** Derive semantic status updates from raw tool activity events. */
  async handleToolActivityEvent(event: ToolActivityEvent): Promise<void> {
    if (event.interfaceType !== this.transport.interfaceId()) {
      return;
    }

    switch (event.type) {
      case "tool:invoking":
        this.pendingToolCompletions.delete(this.getToolCompletionKey(event));
        await this.transport.handleToolStatusUpdate(
          toToolStatusUpdate(event, "running"),
        );
        return;
      case "tool:completed":
        if (this.isProcessingInput) {
          this.pendingToolCompletions.set(
            this.getToolCompletionKey(event),
            event,
          );
          return;
        }
        await this.transport.handleToolStatusUpdate(
          toToolStatusUpdate(event, "completed"),
        );
        return;
      case "tool:failed":
        this.pendingToolCompletions.delete(this.getToolCompletionKey(event));
        await this.transport.handleToolStatusUpdate(
          toToolStatusUpdate(event, "failed"),
        );
        return;
    }
  }

  /** Resolve deferred tool completions once an agent response is available. */
  async handleAgentResponseToolStatuses(
    response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
    conversationId: string,
  ): Promise<void> {
    if (this.pendingToolCompletions.size === 0) {
      return;
    }

    const interfaceId = this.transport.interfaceId();
    const completions = Array.from(this.pendingToolCompletions.values()).filter(
      (event) =>
        event.interfaceType === interfaceId &&
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
      await this.transport.handleToolStatusUpdate(
        toToolStatusUpdate(event, state),
      );
    }
  }

  private shouldHandleProgressEvent(event: JobProgressEvent): boolean {
    // Only handle events for this interface type. An event without an
    // interfaceType is broadcast and handled by everyone.
    const eventInterfaceType = event.metadata.interfaceType;
    return (
      !eventInterfaceType || eventInterfaceType === this.transport.interfaceId()
    );
  }

  private updateProgressState(event: JobProgressEvent): void {
    this.progressEvents.set(event.id, event);
    this.notifyProgressCallback();
  }

  /**
   * Handle processing updates. Returns true when a tracked agent response
   * handled the update and the remaining flow should stop immediately.
   */
  private async handleProcessingProgress(
    event: JobProgressEvent,
    targetChannelId: string | null,
    rootJobId: string,
  ): Promise<boolean> {
    if (
      event.status !== "processing" ||
      !this.transport.supportsMessageEditing()
    ) {
      return false;
    }

    // If we have agent response tracking for this job, edit that response with
    // progress and stop to preserve the previous early-return behavior.
    const agentTracking = this.agentResponseTracking.get(event.id);
    if (agentTracking) {
      await this.editTrackedProgressMessage(event, agentTracking);
      return true;
    }

    const progressMessage = this.transport.formatProgressOutput(event);
    const existingTracking = this.progressMessageTracking.get(rootJobId);
    const now = Date.now();

    if (existingTracking) {
      // Throttle updates to prevent rate limiting.
      if (now - existingTracking.lastUpdate >= PROGRESS_EDIT_THROTTLE_MS) {
        await this.transport.editMessage({
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

    await this.transport.editMessage({
      channelId: tracking.channelId,
      messageId: tracking.messageId,
      newMessage: this.transport.formatProgressOutput(event),
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
    const messageId = await this.transport.sendMessageWithId({
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
    this.transport.logger().debug("Tracking progress message", {
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
    const completionMessage = this.transport.formatCompletionOutput(event);
    const progressTracking = this.progressMessageTracking.get(rootJobId);
    const agentTracking = this.agentResponseTracking.get(event.id);

    this.transport.logger().debug("Completion event received", {
      eventId: event.id,
      rootJobId,
      hasProgressTracking: !!progressTracking,
      hasAgentTracking: !!agentTracking,
      supportsEditing: this.transport.supportsMessageEditing(),
    });

    if (this.transport.supportsMessageEditing()) {
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
      await this.transport.editMessage({
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
      await this.transport.editMessage({
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

    this.transport.sendMessageToChannel({ channelId, message });
  }

  private scheduleProgressCleanup(eventId: string): void {
    this.cleanupSupervisor.schedule(eventId, () => {
      this.progressEvents.delete(eventId);
      this.notifyProgressCallback();
    });
  }

  private logProgressProcessed(event: JobProgressEvent): void {
    this.transport.logger().debug("Progress event processed", {
      eventId: event.id,
      status: event.status,
      operationType: event.metadata.operationType,
      targetChannel: event.metadata.channelId,
    });
  }

  private getToolCompletionKey(event: ToolActivityEvent): string {
    return `${event.interfaceType}:${event.conversationId}:${event.toolName}`;
  }

  private notifyProgressCallback(): void {
    this.progressCallback?.(this.getProgressEvents());
  }
}
