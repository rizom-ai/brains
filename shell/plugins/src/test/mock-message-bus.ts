import {
  validateMessage,
  type IMessageBus,
  type MessageBusSendRequest,
  type MessageHandler,
  type MessageResponse,
} from "@brains/messaging-service";

/**
 * A MessageBus double that really delivers.
 *
 * Plugins subscribe during registration and tests send afterwards, so the
 * handlers have to be kept rather than recorded: a bus that only counted
 * calls would pass every test that never checks what a handler did.
 */
export function createMockMessageBus(): IMessageBus {
  const messageHandlers = new Map<
    string,
    Set<MessageHandler<unknown, unknown>>
  >();

  return {
    send: async <T = unknown, R = unknown>(
      request: MessageBusSendRequest<T>,
    ): Promise<MessageResponse<R>> => {
      const { type, payload, sender, broadcast } = request;
      const handlers = messageHandlers.get(type) ?? new Set();
      let result: MessageResponse<unknown> = { success: true };
      for (const handler of handlers) {
        const response = await handler({
          type,
          payload,
          source: sender,
          id: `msg-${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
        if (broadcast) continue;
        result = response;
        break;
      }
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the bus is generic in its response type with no schema to check against; the fake stores erased handlers
      return result as MessageResponse<R>;
    },
    subscribe: <T = unknown, R = unknown>(
      type: string,
      handler: MessageHandler<T, R>,
    ): (() => void) => {
      const handlers =
        messageHandlers.get(type) ??
        new Set<MessageHandler<unknown, unknown>>();
      messageHandlers.set(type, handlers);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- erasing the handler is what lets one set hold every subscription
      const erased = handler as MessageHandler<unknown, unknown>;
      handlers.add(erased);
      return (): void => {
        messageHandlers.get(type)?.delete(erased);
      };
    },
    unsubscribe: (): void => {},
    hasHandlers: (messageType: string): boolean =>
      (messageHandlers.get(messageType)?.size ?? 0) > 0,
    getHandlerCount: (messageType: string): number =>
      messageHandlers.get(messageType)?.size ?? 0,
    // The fake does not model targeting, so every handler counts as untargeted.
    getTargetedHandlerCount: (): number => 0,
    clearHandlers: (messageType: string): void => {
      messageHandlers.delete(messageType);
    },
    clearAllHandlers: (): void => {
      messageHandlers.clear();
    },
    collect: async <T = unknown, R = unknown>(
      request: MessageBusSendRequest<T>,
    ): Promise<MessageResponse<R>[]> => {
      const handlers = messageHandlers.get(request.type) ?? new Set();
      return Promise.all(
        Array.from(handlers).map(
          async (handler) =>
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see the note on send()
            (await handler({
              type: request.type,
              payload: request.payload,
              source: request.sender,
              id: `msg-${Date.now()}`,
              timestamp: new Date().toISOString(),
            })) as MessageResponse<R>,
        ),
      );
    },
    // The caller supplies the schema, so the fake can validate for real
    // rather than approximate it.
    validateMessage,
  } satisfies IMessageBus;
}
