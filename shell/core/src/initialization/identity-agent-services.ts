import {
  AgentService,
  createBrainAgentFactory,
  type IAgentService,
  type IAIService,
} from "@brains/ai-service";
import type { IConversationService } from "@brains/conversation-service";
import type { IEntityService } from "@brains/entity-service";
import {
  AnchorProfileService,
  BrainCharacterService,
} from "@brains/identity-service";
import type { IMCPService } from "@brains/mcp-service";
import { type IMessageBus, type MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import type { ShellConfig } from "../config";
import { SHELL_ENTITY_TYPES } from "../constants";

export interface IdentityAndAgentServices {
  identityService: BrainCharacterService;
  profileService: AnchorProfileService;
  agentService: IAgentService;
}

export interface IdentityAndAgentServiceOptions {
  config: ShellConfig;
  entityService: IEntityService;
  logger: Logger;
  messageBus: MessageBus;
  aiService: IAIService;
  mcpService: IMCPService;
  conversationService: IConversationService;
  disposables: Array<() => void>;
}

/**
 * Subscribe to entity lifecycle events (created, updated, deleted) for cache invalidation.
 * Calls the provided refresh callback when the specified entity type/id changes.
 */
function subscribeToEntityCacheInvalidation(
  messageBus: IMessageBus,
  entityType: string,
  entityId: string,
  refreshCache: () => Promise<void>,
  logger: Logger,
): (() => void)[] {
  const events = [
    "entity:created",
    "entity:updated",
    "entity:deleted",
  ] as const;

  return events.map((event) =>
    messageBus.subscribe<{ entityType: string; entityId: string }, void>(
      event,
      async (message) => {
        if (
          message.payload.entityType === entityType &&
          message.payload.entityId === entityId
        ) {
          await refreshCache();
          const action = event.replace("entity:", "");
          logger.debug(`${entityType} entity ${action}, cache refreshed`);
        }
        return { success: true };
      },
    ),
  );
}

export function initializeIdentityAndAgentServices(
  options: IdentityAndAgentServiceOptions,
): IdentityAndAgentServices {
  const {
    config,
    entityService,
    logger,
    messageBus,
    aiService,
    mcpService,
    conversationService,
    disposables,
  } = options;

  const identityService = BrainCharacterService.getInstance(
    entityService,
    logger,
    config.identity,
  );

  disposables.push(
    ...subscribeToEntityCacheInvalidation(
      messageBus,
      SHELL_ENTITY_TYPES.BRAIN_CHARACTER,
      SHELL_ENTITY_TYPES.BRAIN_CHARACTER,
      () => identityService.refreshCache(),
      logger,
    ),
  );

  const profileService = AnchorProfileService.getInstance(
    entityService,
    logger,
    config.profile,
  );

  const agentFactory = createBrainAgentFactory({
    model: aiService.getModel(),
    modelId: aiService.getConfig().model,
    webSearch: aiService.getConfig().webSearch,
    temperature: aiService.getConfig().temperature,
    maxTokens: aiService.getConfig().maxTokens,
    messageBus,
  });

  const agentService = AgentService.getInstance(
    mcpService,
    conversationService,
    identityService,
    profileService,
    logger,
    { agentFactory },
  );

  disposables.push(
    ...subscribeToEntityCacheInvalidation(
      messageBus,
      SHELL_ENTITY_TYPES.ANCHOR_PROFILE,
      SHELL_ENTITY_TYPES.ANCHOR_PROFILE,
      () => profileService.refreshCache(),
      logger,
    ),
  );

  // Invalidate cached agent when identity or profile changes.
  // Next conversation will rebuild with fresh data.
  for (const entityType of [
    SHELL_ENTITY_TYPES.BRAIN_CHARACTER,
    SHELL_ENTITY_TYPES.ANCHOR_PROFILE,
  ]) {
    disposables.push(
      ...subscribeToEntityCacheInvalidation(
        messageBus,
        entityType,
        entityType,
        async () => agentService.invalidateAgent(),
        logger,
      ),
    );
  }

  return { identityService, profileService, agentService };
}
