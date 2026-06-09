import {
  AgentService,
  createBrainActorId,
  createBrainAgentFactory,
  type ChatAttachment,
  type ChatAttachmentSource,
  type IAgentService,
  type IAIService,
} from "@brains/ai-service";
import {
  AGENT_CONTEXT_REQUEST_CHANNEL,
  parseAgentContextItems,
  type AgentContextRequest,
} from "@brains/contracts";
import type { IConversationService } from "@brains/conversation-service";
import type { IEntityRegistry, IEntityService } from "@brains/entity-service";
import {
  AnchorProfileService,
  BrainCharacterService,
  CanonicalIdentityService,
} from "@brains/identity-service";
import type { IMCPService } from "@brains/mcp-service";
import type {
  ResolvedRuntimeUpload,
  RuntimeUploadRegistry,
} from "@brains/plugins";
import { type IMessageBus, type MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import type { ShellConfig } from "../config";
import { SHELL_ENTITY_TYPES } from "../constants";

export interface IdentityAndAgentServices {
  identityService: BrainCharacterService;
  profileService: AnchorProfileService;
  canonicalIdentityService: CanonicalIdentityService;
  agentService: IAgentService;
}

export interface IdentityAndAgentServiceOptions {
  config: ShellConfig;
  entityService: IEntityService;
  entityRegistry: IEntityRegistry;
  logger: Logger;
  messageBus: MessageBus;
  aiService: IAIService;
  mcpService: IMCPService;
  conversationService: IConversationService;
  runtimeUploadRegistry: RuntimeUploadRegistry;
  disposables: Array<() => void>;
}

/**
 * Subscribe to entity lifecycle events (created, updated, deleted) for cache invalidation.
 * Calls the provided refresh callback when the specified entity type changes.
 * If entityId is provided, only that singleton entity invalidates the cache.
 */
function subscribeToEntityCacheInvalidation(
  messageBus: IMessageBus,
  entityType: string,
  entityId: string | null,
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
          (entityId === null || message.payload.entityId === entityId)
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

async function resolveRuntimeUploadAttachment(
  source: ChatAttachmentSource,
  runtimeUploadRegistry: RuntimeUploadRegistry,
  logger: Logger,
): Promise<ChatAttachment | null> {
  const namespace = getRuntimeUploadNamespace(source.kind);
  if (!namespace) return null;

  try {
    const store = runtimeUploadRegistry.scoped({
      namespace,
      refKind: source.kind,
      routePath: "",
    });
    return toChatAttachment(await store.read(source.id), source);
  } catch (error) {
    logger.debug("Skipped unavailable prior runtime upload", {
      uploadKind: source.kind,
      uploadId: source.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function getRuntimeUploadNamespace(refKind: string): string | null {
  return refKind === "upload" ? "upload" : null;
}

function toChatAttachment(
  resolved: ResolvedRuntimeUpload,
  source: ChatAttachmentSource,
): ChatAttachment {
  const { record, content } = resolved;
  if (isTextUpload(record.mediaType)) {
    return {
      kind: "text",
      filename: record.filename,
      mediaType: record.mediaType,
      content: new TextDecoder("utf-8").decode(content).replace(/^\uFEFF/, ""),
      sizeBytes: record.sizeBytes,
      source,
    };
  }

  return {
    kind: "file",
    filename: record.filename,
    mediaType: record.mediaType,
    data: new Uint8Array(content),
    sizeBytes: record.sizeBytes,
    source,
  };
}

function isTextUpload(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase();
  return normalized.startsWith("text/") || normalized === "application/json";
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
    runtimeUploadRegistry,
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

  const canonicalIdentityService = CanonicalIdentityService.getInstance(logger);

  const agentFactory = createBrainAgentFactory({
    model: aiService.getModel(),
    modelId: aiService.getConfig().model,
    webSearch: aiService.getConfig().webSearch,
    temperature: aiService.getConfig().temperature,
    maxTokens: aiService.getConfig().maxTokens,
    messageBus,
  });
  const assistantActorId = createBrainActorId(config.name);

  const agentService = AgentService.getInstance(
    mcpService,
    conversationService,
    identityService,
    profileService,
    logger,
    {
      agentFactory,
      canonicalIdentityResolver: canonicalIdentityService,
      uploadAttachmentResolver: (source) =>
        resolveRuntimeUploadAttachment(source, runtimeUploadRegistry, logger),
      agentContextProvider: async (request: AgentContextRequest) => {
        const response = await messageBus.send({
          type: AGENT_CONTEXT_REQUEST_CHANNEL,
          sender: "shell:agent-service",
          payload: request,
        });
        if ("noop" in response || !response.success) return [];
        return parseAgentContextItems(response.data);
      },
      ...(assistantActorId ? { assistantActorId } : {}),
      ...(config.agentInstructions && {
        agentInstructions: config.agentInstructions,
      }),
    },
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

  return {
    identityService,
    profileService,
    canonicalIdentityService,
    agentService,
  };
}
