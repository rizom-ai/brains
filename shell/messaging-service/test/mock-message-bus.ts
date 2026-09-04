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
 * Re-apply a generic signature that `mock()` erased.
 *
 * A local copy of `@brains/test-utils`'s `genericSpy`: that package depends on
 * this one, so importing it back would cycle. The limitation is the same —
 * `mock(fn)` returns `Mock<typeof fn>`, which captures one instantiation and
 * drops the type parameters, so it can never be assigned to a generic member
 * like `send<T, R>`. Nothing else may use it.
 */
function genericSpy<TMember>(spy: unknown): TMember {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the whole point of the helper; see the comment above
  return spy as TMember;
}

/**
 * Returns the interface rather than the MessageBus class.
 *
 * MessageBus is a class, so declaring it here made the result nominally typed:
 * every consumer wanting an IMessageBus had to cast, and four of them did.
 *
 * `satisfies` rather than an assertion on the whole literal: the object is
 * checked member by member, so a method added to IMessageBus — or a signature
 * that changes — fails here instead of leaving a stale mock that every test
 * still passes against. Only `send` needs the generic escape hatch.
 */
export function createMockMessageBus(
  options: MockMessageBusOptions = {},
): IMessageBus {
  const { returns = {} } = options;
  const defaultSendResult = returns.send ?? { success: true };

  return {
    subscribe: genericSpy<IMessageBus["subscribe"]>(mock(() => mock(() => {}))),
    unsubscribe: mock(() => {}),
    send: genericSpy<IMessageBus["send"]>(
      mock(() => Promise.resolve(defaultSendResult)),
    ),
    hasHandlers: mock(() => returns.hasHandlers ?? false),
    collect: genericSpy<IMessageBus["collect"]>(
      mock(() => Promise.resolve([])),
    ),
    validateMessage: genericSpy<IMessageBus["validateMessage"]>(
      mock((message: unknown) => ({ success: true, data: message })),
    ),
    getHandlerCount: mock(() => returns.getHandlerCount ?? 0),
    getTargetedHandlerCount: mock(() => returns.getTargetedHandlerCount ?? 0),
    clearHandlers: mock(() => {}),
    clearAllHandlers: mock(() => {}),
  } satisfies IMessageBus;
}
