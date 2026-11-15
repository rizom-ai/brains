import type { JobContext, JobProgressEvent } from "@brains/job-queue";
import type { Logger } from "@brains/utils/logger";
import type { MessageInterfacePluginContext } from "../interface/context";
import {
  formatCompletionMessage,
  formatProgressMessage,
  setupProgressHandler,
} from "./progress-handler";
import {
  ProgressMessageCoordinator,
  type EditMessageRequest,
  type MessageInterfaceOutput,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
} from "./progress-message-coordinator";
import {
  setupToolActivityHandler,
  type ToolActivityEvent,
} from "./tool-event-handler";
import type { ToolStatusUpdate } from "./tool-status";

/**
 * How a message interface sends, edits and renders: what its declaration
 * provides, the rest left at the defaults every message interface has (no
 * editing, plain progress and completion text, no tool status rendering).
 */
export interface MessageCoordinationHost {
  readonly id: string;
  logger(): Logger;
  sendMessageToChannel(request: SendMessageToChannelRequest): void;
  sendMessageWithId?(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined>;
  editMessage?(request: EditMessageRequest): Promise<boolean>;
  supportsMessageEditing(): boolean;
  formatProgressOutput?(
    event: JobProgressEvent,
  ): MessageInterfaceOutput | undefined;
  formatCompletionOutput?(
    event: JobProgressEvent,
  ): MessageInterfaceOutput | undefined;
  handleToolStatusUpdate?(update: ToolStatusUpdate): Promise<void>;
}

/**
 * A message interface's progress bookkeeping: live job events, editable
 * progress messages, tool completions deferred while input is answered, and
 * the completions buffered until the reply has gone.
 */
export function createMessageCoordinator(
  host: MessageCoordinationHost,
): ProgressMessageCoordinator {
  return new ProgressMessageCoordinator({
    interfaceId: (): string => host.id,
    logger: (): Logger => host.logger(),
    sendMessageToChannel: (request): void => {
      host.sendMessageToChannel(request);
    },
    sendMessageWithId: (request): Promise<string | undefined> =>
      host.sendMessageWithId?.(request) ?? Promise.resolve(undefined),
    editMessage: (request): Promise<boolean> =>
      host.editMessage?.(request) ?? Promise.resolve(false),
    supportsMessageEditing: (): boolean => host.supportsMessageEditing(),
    formatProgressOutput: (event): MessageInterfaceOutput =>
      host.formatProgressOutput?.(event) ?? formatProgressMessage(event),
    formatCompletionOutput: (event): MessageInterfaceOutput =>
      host.formatCompletionOutput?.(event) ?? formatCompletionMessage(event),
    onProgressUpdate: (): Promise<void> => Promise.resolve(),
    handleToolStatusUpdate: async (update): Promise<void> => {
      await host.handleToolStatusUpdate?.(update);
    },
  });
}

/**
 * Hear the job progress and tool activity a message interface answers, once
 * its channels are registered; failures are logged, never thrown at the bus.
 */
export function subscribeMessageCoordination(
  context: MessageInterfacePluginContext,
  host: {
    readonly id: string;
    logger(): Logger;
    handleProgressEvent(
      event: JobProgressEvent,
      context: JobContext,
    ): Promise<void>;
    handleToolActivityEvent(event: ToolActivityEvent): Promise<void>;
  },
): void {
  setupProgressHandler(context, {
    onProgress: (event, eventContext) =>
      host.handleProgressEvent(event, eventContext),
    onError: (error) => {
      host.logger().error("Error handling progress event", {
        error,
        interfaceId: host.id,
      });
    },
  });
  setupToolActivityHandler(context, {
    onToolActivity: (event) => host.handleToolActivityEvent(event),
    onError: (error) => {
      host.logger().error("Error handling tool activity event", {
        error,
        interfaceId: host.id,
      });
    },
  });
  host
    .logger()
    .debug("Message interface registered with progress and tool handlers", {
      id: host.id,
    });
}
