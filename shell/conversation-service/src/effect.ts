import { Context, Effect, Layer } from "@brains/utils/effect";
import type { Logger } from "@brains/utils/logger";
import type { MessageBus } from "@brains/messaging-service";
import { ConversationService } from "./conversation-service";
import type {
  ConversationDbConfig,
  ConversationServiceConfig,
  IConversationService,
} from "./types";

export type ConversationServiceTag =
  "@brains/conversation-service/ConversationService";
export const ConversationServiceTag: Context.Tag<
  ConversationServiceTag,
  IConversationService
> = Context.GenericTag<ConversationServiceTag, IConversationService>(
  "@brains/conversation-service/ConversationService",
);

export interface ConversationServiceLayerOptions {
  dbConfig: ConversationDbConfig;
  logger: Logger;
  messageBus: MessageBus;
  config?: ConversationServiceConfig;
  service?: IConversationService;
}

interface ConversationServiceResource {
  service: IConversationService;
  close(): void;
}

function acquireConversationService(
  options: ConversationServiceLayerOptions,
): ConversationServiceResource {
  if (options.service) {
    const service = options.service;
    return {
      service,
      close: () => service.close(),
    };
  }

  // createFreshFromConfig, not createFresh: it records the client and url, and
  // without them the service's initialize() cannot apply busy_timeout. A
  // connection without it fails an insert outright the moment another writer
  // holds the lock, which is common while a brain seeds content.
  const service = ConversationService.createFreshFromConfig(
    options.logger,
    options.messageBus,
    options.dbConfig,
    options.config,
  );
  try {
    return {
      service,
      close: (): void => service.close(),
    };
  } catch (error) {
    service.close();
    throw error;
  }
}

/** Own one conversation service and database for the lifetime of the layer. */
export function createConversationServiceLayer(
  options: ConversationServiceLayerOptions,
): Layer.Layer<ConversationServiceTag> {
  return Layer.scoped(
    ConversationServiceTag,
    Effect.acquireRelease(
      Effect.sync(() => acquireConversationService(options)),
      (resource) =>
        Effect.sync(() => {
          resource.close();
        }),
    ).pipe(Effect.map((resource) => resource.service)),
  );
}
