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
import type { ProjectionRuntimeControls } from "../projection-runtime";

/**
 * The recurring-check surface the shell wires.
 *
 * RecurringCheckService is a class, so declaring it here made this dependency
 * nominally typed and a test could not supply a stand-in. recurring-check-inbox-source
 * already takes a Pick of the same service; this makes the shell consistent
 * with it.
 */
export type ShellRecurringChecks = Pick<
  RecurringCheckService,
  | "start"
  | "stop"
  | "abandon"
  | "namespace"
  | "unregisterPlugin"
  | "listOpenAlerts"
  | "resolveOpenAlert"
>;

export interface JobServicesLifecycle {
  closeRuntime(): Promise<void>;
}

export interface LocalDatabaseEndpointLifecycle {
  readonly role: "owner" | "client";
  initialize(): Promise<void>;
  close(): void | Promise<void>;
}

export interface ShellServices {
  logger: Logger;
  operationContext: OperationContext;
  localDatabaseEndpoint: LocalDatabaseEndpointLifecycle | undefined;
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
  recurringCheckService: ShellRecurringChecks;
}

export interface ShellDependencies {
  logger?: Logger;
  operationContext?: OperationContext;
  projectionRuntimeSupervisor?: ProjectionRuntimeSupervisor;
  projectionRuntime?: ProjectionRuntimeControls;
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
  recurringCheckService?: ShellRecurringChecks;
  profileKindRegistry?: ProfileKindRegistry;
  channelRegistry?: ChannelRegistry;
  inboxRegistry?: InboxRegistry;
  inboxFollowUpRegistry?: InboxFollowUpRegistry;
  operationalHealthRegistry?: OperationalHealthRegistry;
  accountSettingsRegistry?: AccountSettingsRegistry;
}
