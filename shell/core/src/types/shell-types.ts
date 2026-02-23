import type { IAIService } from "@brains/ai-service";
import type { ContentService } from "@brains/content-service";
import type { IConversationService } from "@brains/conversation-service";
import type { DaemonRegistry } from "@brains/daemon-registry";
import type { DataSourceRegistry } from "@brains/entity-service";
import type { IEmbeddingService } from "@brains/embedding-service";
import type { IEntityRegistry, IEntityService } from "@brains/entity-service";
import type {
  IBatchJobManager,
  IJobQueueService,
  IJobQueueWorker,
} from "@brains/job-queue";
import type { IMCPService } from "@brains/mcp-service";
import type { MessageBus } from "@brains/messaging-service";
import type {
  PermissionService,
  RenderService,
  TemplateRegistry,
} from "@brains/templates";
import type { PluginManager } from "@brains/plugins";
import type { IJobProgressMonitor, Logger } from "@brains/utils";

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
