import { mock } from "bun:test";
import type { IMessageBus, MessageResponse } from "../src";

/**
 * Options for configuring mock message bus return values.
 */
export interface MockMessageBusReturns {
  send?: MessageResponse;
  hasHandlers?: boolean;
  getHandlerCount?: number;
  getTargetedHandlerCount?: number;
}

/**
 * Options for creating a mock message bus.
 */
export interface MockMessageBusOptions {
  returns?: MockMessageBusReturns;
}

/**
 * Create a mock message bus with all methods pre-configured.
 */
/**
 * Returns the interface rather than the MessageBus class.
 *
 * MessageBus is a class, so declaring it here made the result nominally typed:
 * every consumer wanting an IMessageBus had to cast, and four of them did. The
 * one assertion left is the generic-erasure case `genericSpy` covers
 * elsewhere — `send<T, R>` cannot be expressed by `mock()` — and it cannot
 * be used here, since @brains/test-utils depends on this package and declaring
 * it back would cycle. One cast here beats one at every call site.
 */
export function createMockMessageBus(
  options: MockMessageBusOptions = {},
): IMessageBus {
  const { returns = {} } = options;
  const defaultSendResult = returns.send ?? { success: true };

  return {
    subscribe: mock(() => mock(() => {})),
    unsubscribe: mock(() => {}),
    send: mock(() => Promise.resolve(defaultSendResult)),
    hasHandlers: mock(() => returns.hasHandlers ?? false),
    clearHandlers: mock(() => {}),
    clearAllHandlers: mock(() => {}),
    getHandlerCount: mock(() => returns.getHandlerCount ?? 0),
    getTargetedHandlerCount: mock(() => returns.getTargetedHandlerCount ?? 0),
    validateMessage: mock(() => ({ valid: true, data: {} })),
  } as unknown as IMessageBus;
}
