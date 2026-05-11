import type { IAgentService, IAIService } from "@brains/ai-service";
import type { ContentService } from "@brains/content-service";
import type { IConversationService } from "@brains/conversation-service";
import type { DaemonRegistry } from "../daemon-registry";
import type {
  DataSourceRegistry,
  EntityRegistry,
  EntityService,
  IEmbeddingService,
  IEntityRegistry,
  IEntityService,
} from "@brains/entity-service";
import type {
  IBatchJobManager,
  IJobQueueService,
  IJobQueueWorker,
} from "@brains/job-queue";
import type { IMCPService } from "@brains/mcp-service";
import type {
  BrainCharacterService,
  AnchorProfileService,
  CanonicalIdentityService,
} from "@brains/identity-service";
import type { MessageBus } from "@brains/messaging-service";
import type {
  PermissionService,
  RenderService,
  TemplateRegistry,
} from "@brains/templates";
import type { PluginManager } from "@brains/plugins";
import type { IJobProgressMonitor, Logger } from "@brains/utils";

export interface ShellServices {
  logger: Logger;
  disposables: Array<() => void>;
  entityRegistry: EntityRegistry;
  messageBus: MessageBus;
  renderService: RenderService;
  daemonRegistry: DaemonRegistry;
  pluginManager: PluginManager;
  templateRegistry: TemplateRegistry;
  dataSourceRegistry: DataSourceRegistry;
  mcpService: IMCPService;
  embeddingService: IEmbeddingService;
  entityService: EntityService;
  aiService: IAIService;
  conversationService: IConversationService;
  contentService: ContentService;
  jobQueueService: IJobQueueService;
  jobQueueWorker: IJobQueueWorker;
  batchJobManager: IBatchJobManager;
  jobProgressMonitor: IJobProgressMonitor;
  permissionService: PermissionService;
  identityService: BrainCharacterService;
  profileService: AnchorProfileService;
  canonicalIdentityService: CanonicalIdentityService;
  agentService: IAgentService;
}

export interface ShellDependencies {
  logger?: Logger;
  embeddingService?: IEmbeddingService;
  aiService?: IAIService;
  entityService?: IEntityService;
  conversationService?: IConversationService;
  entityRegistry?: IEntityRegistry;
  messageBus?: MessageBus;
  renderService?: RenderService;
  daemonRegistry?: DaemonRegistry;
  pluginManager?: PluginManager;
  mcpService?: IMCPService;
  contentService?: ContentService;
  jobQueueService?: IJobQueueService;
  jobQueueWorker?: IJobQueueWorker;
  jobProgressMonitor?: IJobProgressMonitor;
  batchJobManager?: IBatchJobManager;
  permissionService?: PermissionService;
  templateRegistry?: TemplateRegistry;
  dataSourceRegistry?: DataSourceRegistry;
}
