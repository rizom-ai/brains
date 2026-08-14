import type { IAgentService, IAIService } from "@brains/ai-service";
import type { ContentService } from "@brains/content-service";
import type { IConversationService } from "@brains/conversation-service";
import type { DaemonRegistry } from "../daemon-registry";
import type {
  DataSourceRegistry,
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
  ProfileKindRegistry,
} from "@brains/identity-service";
import type { MessageBus } from "@brains/messaging-service";
import type {
  PermissionService,
  RenderService,
  TemplateRegistry,
} from "@brains/templates";
import type {
  AccountSettingsRegistry,
  AttachmentRegistry,
  ChannelRegistry,
  InboxFollowUpRegistry,
  InboxRegistry,
  OperationalHealthRegistry,
  PluginManager,
  RuntimeUploadRegistry,
} from "@brains/plugins";
import type { RecurringCheckService } from "@brains/recurring-checks";
import type { IRuntimeStateService } from "@brains/runtime-state";
import type { Logger } from "@brains/utils/logger";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import type { ProjectionRuntimeSupervisor } from "../projection-runtime-supervisor";
import type { OperationContext } from "@brains/operation-context";

export interface JobServicesLifecycle {
  closeRuntime(): Promise<void>;
}

export interface ShellServices {
  logger: Logger;
  operationContext: OperationContext;
  projectionRuntimeSupervisor: ProjectionRuntimeSupervisor;
  disposables: Array<() => void>;
  entityRegistry: IEntityRegistry;
  messageBus: MessageBus;
  renderService: RenderService;
  daemonRegistry: DaemonRegistry;
  pluginManager: PluginManager;
  templateRegistry: TemplateRegistry;
  dataSourceRegistry: DataSourceRegistry;
  mcpService: IMCPService;
  embeddingService: IEmbeddingService;
  entityService: IEntityService;
  aiService: IAIService;
  conversationService: IConversationService;
  contentService: ContentService;
  jobQueueService: IJobQueueService;
  jobQueueWorker: IJobQueueWorker;
  batchJobManager: IBatchJobManager;
  jobProgressMonitor: IJobProgressMonitor;
  jobServicesLifecycle: JobServicesLifecycle;
  permissionService: PermissionService;
  identityService: BrainCharacterService;
  profileService: AnchorProfileService;
  canonicalIdentityService: CanonicalIdentityService;
  profileKindRegistry: ProfileKindRegistry;
  channelRegistry: ChannelRegistry;
  inboxRegistry: InboxRegistry;
  inboxFollowUpRegistry: InboxFollowUpRegistry;
  operationalHealthRegistry: OperationalHealthRegistry;
  accountSettingsRegistry: AccountSettingsRegistry;
  agentService: IAgentService;
  attachmentRegistry: AttachmentRegistry;
  runtimeUploadRegistry: RuntimeUploadRegistry;
  runtimeStateService: IRuntimeStateService;
  recurringCheckService: RecurringCheckService;
}

export interface ShellDependencies {
  logger?: Logger;
  operationContext?: OperationContext;
  projectionRuntimeSupervisor?: ProjectionRuntimeSupervisor;
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
  attachmentRegistry?: AttachmentRegistry;
  runtimeUploadRegistry?: RuntimeUploadRegistry;
  runtimeStateService?: IRuntimeStateService;
  recurringCheckService?: RecurringCheckService;
  profileKindRegistry?: ProfileKindRegistry;
  channelRegistry?: ChannelRegistry;
  inboxRegistry?: InboxRegistry;
  inboxFollowUpRegistry?: InboxFollowUpRegistry;
  operationalHealthRegistry?: OperationalHealthRegistry;
  accountSettingsRegistry?: AccountSettingsRegistry;
}
