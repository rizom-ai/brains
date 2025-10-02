import type { Logger, IJobProgressMonitor } from "@brains/utils";
import type { IEmbeddingService } from "@brains/embedding-service";
import type { IAIService } from "@brains/ai-service";
import type { ServiceRegistry } from "@brains/service-registry";
import type { IEntityRegistry, IEntityService } from "@brains/entity-service";
import type {
  IJobQueueService,
  IJobQueueWorker,
  IBatchJobManager,
} from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import type { PluginManager } from "@brains/plugins";
import type { CommandRegistry } from "@brains/command-registry";
import type { TemplateRegistry } from "@brains/templates";
import { type IMCPService } from "@brains/mcp-service";
import type { DaemonRegistry } from "@brains/daemon-registry";
import { type IConversationService } from "@brains/conversation-service";
import type { ContentService } from "@brains/content-service";
import type { PermissionService } from "@brains/permission-service";
import type { RenderService } from "@brains/render-service";
import type { DataSourceRegistry } from "@brains/datasource";

/**
 * Required dependencies for Shell initialization
 */
export interface ShellDependencies {
  logger?: Logger;
  embeddingService?: IEmbeddingService;
  aiService?: IAIService;
  entityService?: IEntityService;
  conversationService?: IConversationService;
  serviceRegistry?: ServiceRegistry;
  entityRegistry?: IEntityRegistry;
  messageBus?: MessageBus;
  renderService?: RenderService;
  daemonRegistry?: DaemonRegistry;
  pluginManager?: PluginManager;
  commandRegistry?: CommandRegistry;
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
