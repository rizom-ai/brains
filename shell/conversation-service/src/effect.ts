import { Context, scopedServiceLayer } from "@brains/utils/effect";
import type { Layer, ScopedService } from "@brains/utils/effect";
import type { Logger } from "@brains/utils/logger";
import type { MessageBus } from "@brains/messaging-service";
import { ConversationService } from "./conversation-service";
import { createConversationDatabase } from "./database";
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

function acquireConversationService(
  options: ConversationServiceLayerOptions,
): ScopedService<IConversationService> {
  if (options.service) {
    const service = options.service;
    return {
      service,
      close: () => service.close(),
    };
  }

  const { db, client } = createConversationDatabase(options.dbConfig);
  try {
    const service = ConversationService.createFresh(
      db,
      options.logger,
      options.messageBus,
      options.config,
    );
    return {
      service,
      close: (): void => {
        try {
          service.close();
        } finally {
          client.close();
        }
      },
    };
  } catch (error) {
    client.close();
    throw error;
  }
}

/** Own one conversation service and database for the lifetime of the layer. */
export function createConversationServiceLayer(
  options: ConversationServiceLayerOptions,
): Layer.Layer<ConversationServiceTag> {
  return scopedServiceLayer(ConversationServiceTag, () =>
    acquireConversationService(options),
  );
}
