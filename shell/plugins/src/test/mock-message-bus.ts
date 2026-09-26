import { MessageBus, type IMessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";

/** Fresh in-memory dispatch with the runtime's targeting and coded failures. */
export function createMockMessageBus(
  logger: Logger = createSilentLogger("MockMessageBus"),
): IMessageBus {
  return MessageBus.createFresh(logger);
}
