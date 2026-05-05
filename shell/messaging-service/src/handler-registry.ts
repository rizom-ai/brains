import type {
  InternalMessageResponse,
  MessageHandler,
  MessageWithPayload,
  SubscriptionFilter,
} from "./types";
import { compileFilter, matchesFilter } from "./filter-matcher";
import { toInternalResponse } from "./message-factory";

export type WrappedHandler = (
  message: MessageWithPayload<unknown>,
) => Promise<InternalMessageResponse | null>;

export interface HandlerEntry {
  handler: WrappedHandler;
  originalHandler: unknown;
  filter?: SubscriptionFilter;
}

export interface MatchingHandlers {
  entries: HandlerEntry[];
  totalHandlers: number;
}

/**
 * Stores subscriptions and keeps handler wrapping/filtering concerns out of the
 * public MessageBus facade.
 */
export class HandlerRegistry {
  private readonly handlers = new Map<string, Set<HandlerEntry>>();

  add<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
    filter?: SubscriptionFilter,
  ): HandlerEntry {
    const entry = this.createHandlerEntry(handler, filter);
    this.getOrCreateHandlers(type).add(entry);
    return entry;
  }

  remove(type: string, entry: HandlerEntry): boolean {
    const handlers = this.handlers.get(type);
    if (!handlers) return false;

    const removed = handlers.delete(entry);
    this.deleteEmptyHandlerSet(type, handlers);
    return removed;
  }

  removeHandler<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ): void {
    const handlers = this.handlers.get(type);
    if (!handlers) return;

    for (const entry of Array.from(handlers)) {
      if (entry.originalHandler === handler) {
        handlers.delete(entry);
      }
    }

    this.deleteEmptyHandlerSet(type, handlers);
  }

  getMatchingHandlers(
    type: string,
    message: MessageWithPayload,
  ): MatchingHandlers | undefined {
    const handlers = this.handlers.get(type);
    if (!handlers || handlers.size === 0) return undefined;

    return {
      entries: Array.from(handlers).filter((entry) =>
        matchesFilter(message, entry.filter),
      ),
      totalHandlers: handlers.size,
    };
  }

  hasHandlers(messageType: string): boolean {
    const handlers = this.handlers.get(messageType);
    return handlers !== undefined && handlers.size > 0;
  }

  clearHandlers(messageType: string): boolean {
    return this.handlers.delete(messageType);
  }

  clearAllHandlers(): void {
    this.handlers.clear();
  }

  getHandlerCount(messageType: string): number {
    return this.handlers.get(messageType)?.size ?? 0;
  }

  getTargetedHandlerCount(messageType: string, target: string): number {
    const handlers = this.handlers.get(messageType);
    if (!handlers) return 0;

    return Array.from(handlers).filter(
      (entry) => entry.filter?.target === target,
    ).length;
  }

  private createHandlerEntry<T, R>(
    handler: MessageHandler<T, R>,
    filter?: SubscriptionFilter,
  ): HandlerEntry {
    const entry = {
      handler: this.wrapHandler(handler),
      originalHandler: handler,
    };

    return filter ? { ...entry, filter: compileFilter(filter) } : entry;
  }

  private wrapHandler<T, R>(handler: MessageHandler<T, R>): WrappedHandler {
    return async (message: MessageWithPayload<unknown>) => {
      const typedMessage = message as MessageWithPayload<T>;
      const result = await handler(typedMessage);
      return toInternalResponse(message.id, result);
    };
  }

  private getOrCreateHandlers(type: string): Set<HandlerEntry> {
    let handlers = this.handlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(type, handlers);
    }
    return handlers;
  }

  private deleteEmptyHandlerSet(
    type: string,
    handlers: Set<HandlerEntry>,
  ): void {
    if (handlers.size === 0) {
      this.handlers.delete(type);
    }
  }
}
