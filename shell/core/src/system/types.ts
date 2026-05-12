import type { IEntityService, IEntityRegistry } from "@brains/entity-service";
import type { JobsNamespace } from "@brains/job-queue";
import type { IConversationService } from "@brains/conversation-service";
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import type { DefaultQueryResponse } from "@brains/contracts";
import type { Logger } from "@brains/utils";
import type { RuntimeAppInfo } from "@brains/plugins";
import type { IInsightsRegistry } from "@brains/plugins";

/**
 * Services required by system tools.
 * Direct service references — no plugin instance needed.
 */
export interface SystemServices {
  entityService: IEntityService;
  entityRegistry: IEntityRegistry;
  jobs: JobsNamespace;
  conversationService: IConversationService;
  logger: Logger;

  /** AI query — direct service call */
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;

  /** Identity accessors */
  getIdentity: () => BrainCharacter;
  getProfile: () => AnchorProfile;
  getAppInfo: () => Promise<RuntimeAppInfo>;

  /** Search config */
  searchLimit: number;

  /** Extensible insights registry */
  insights: IInsightsRegistry;
}
