import { mock } from "bun:test";
import type { MessageBus } from "@brains/messaging-service";

/**
 * Options for configuring mock message bus return values
 */
export interface MockMessageBusReturns {
  send?: { success: boolean; data?: unknown; error?: string };
  hasHandlers?: boolean;
  getHandlerCount?: number;
  getTargetedHandlerCount?: number;
}

/**
 * Options for creating a mock message bus
 */
export interface MockMessageBusOptions {
  returns?: MockMessageBusReturns;
}

/**
 * Create a mock message bus with all methods pre-configured.
 * The cast to MessageBus is centralized here so test files don't need unsafe casts.
 *
 * @example
 * ```ts
 * const mockBus = createMockMessageBus({
 *   returns: {
 *     send: { success: true, data: { result: "ok" } },
 *     hasHandlers: true,
 *   },
 * });
 * ```
 */
export function createMockMessageBus(
  options: MockMessageBusOptions = {},
): MessageBus {
  const { returns = {} } = options;

  const defaultSendResult = returns.send ?? { success: true };

  return {
    subscribe: mock(() => mock(() => {})), // Returns unsubscribe function
    unsubscribe: mock(() => {}),
    send: mock(() => Promise.resolve(defaultSendResult)),
    hasHandlers: mock(() => returns.hasHandlers ?? false),
    clearHandlers: mock(() => {}),
    clearAllHandlers: mock(() => {}),
    getHandlerCount: mock(() => returns.getHandlerCount ?? 0),
    getTargetedHandlerCount: mock(() => returns.getTargetedHandlerCount ?? 0),
    validateMessage: mock(() => ({ valid: true, data: {} })),
  } as unknown as MessageBus;
}
