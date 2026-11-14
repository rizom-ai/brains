import type { IShell } from "../interfaces";
import type { JudgeInput } from "../interfaces";
import type { AppInfo } from "../contracts/app-info";
import { type Logger } from "@brains/utils/logger";
import { derivePreviewDomain } from "@brains/site-composition";
import type {
  ICoreEntityService,
  ProjectSemanticSpaceRequest,
  SemanticSpaceProjection,
} from "@brains/entity-service";
import type { PluginRegistrationContext } from "../interfaces";
import type { RuntimeReadiness } from "../contracts/runtime-health";
import type { EntityDisplayEntry } from "@brains/site-composition";
import type { JobsNamespace } from "@brains/job-queue";
import type { IRecurringChecksNamespace } from "@brains/recurring-checks";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { IAttachmentsNamespace } from "../service/attachment-registry";
import type { AccountSettingsRegistry } from "../operator/account-settings-registry";
import type { IAuthNamespace } from "../contracts/auth";
import type { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import type { IRuntimeUploadsNamespace } from "../service/upload-registry";
import {
  createJobAuthorityNamespace,
  type IJobAuthorityNamespace,
} from "../service/job-authority";
import {
  createAppInfoGetter,
  createChannelsNamespace,
  createConversationsNamespace,
  createEndpointsNamespace,
  createEvalNamespace,
  createIdentityNamespace,
  createInboxFollowUpsNamespace,
  createInboxNamespace,
  createAnalyticsNamespace,
  createInteractionsNamespace,
  createJobsNamespace,
  createMessagingNamespace,
  createOperationalHealthNamespace,
  createPermissionsNamespace,
  createPluginsNamespace,
  createProfileKindsNamespace,
} from "./namespaces";
import {
  createStudioNamespace,
  type IStudioNamespace,
} from "./studio-namespace";
import { createDashboardNamespace } from "./dashboard-namespace";
import type { IDashboardNamespace } from "./dashboard-namespace";
import {
  createPublicSkillsNamespace,
  type IPublicSkillsNamespace,
} from "../a2a/public-skills";
import type {
  IChannelsNamespace,
  IConversationsNamespace,
  IEndpointsNamespace,
  IEvalNamespace,
  IIdentityNamespace,
  IInboxNamespace,
  IInboxFollowUpsNamespace,
  IAnalyticsNamespace,
  IOperationalHealthNamespace,
  IPermissionsNamespace,
  IInteractionsNamespace,
  IMessagingNamespace,
  IPluginsNamespace,
  IProfileKindsNamespace,
} from "./context-types";

export interface ISemanticNamespace {
  project(
    request: ProjectSemanticSpaceRequest,
  ): Promise<SemanticSpaceProjection>;
}

export type {
  IChannelsNamespace,
  IConversationsNamespace,
  IEndpointsNamespace,
  IEvalNamespace,
  IIdentityNamespace,
  IInboxFollowUpsNamespace,
  IInboxNamespace,
  IAnalyticsNamespace,
  IInteractionsNamespace,
  IMessageInterfaceChannelsNamespace,
  IMessagingNamespace,
  IOperationalHealthNamespace,
  IPermissionsNamespace,
  IPluginsNamespace,
  IProfileKindsNamespace,
  TypedMessageHandler,
} from "./context-types";

/**
 * Base plugin context — shared by all plugin types (Entity, Service, Interface).
 *
 * Contains only capabilities that every plugin needs.
 * AI, templates, views, and transport are on sibling contexts.
 *
 * Internal to the runtime: packages are declarative definitions and reach
 * what they need through their setup context and `@brains/sdk/internal/*`.
 */
export interface BasePluginContext {
  // ============================================================================
  // Plugin Identity
  // ============================================================================

  /** The registered plugin id. */
  readonly pluginId: string;

  /** Where this plugin keeps its files. */
  readonly dataDir: string;

  readonly domain: string | undefined;
  readonly siteUrl: string | undefined;
  readonly localSiteUrl: string | undefined;
  readonly previewUrl: string | undefined;
  readonly preferLocalUrls: boolean;

  /** Whether this brain runs in production rather than local development. */
  readonly production: boolean;

  readonly appInfo: () => Promise<AppInfo>;
  readonly judge: <T>(input: JudgeInput<T>) => Promise<{
    verdict: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  readonly semantic: ISemanticNamespace;
  readonly identity: IIdentityNamespace;
  readonly channels: IChannelsNamespace;
  readonly inbox: IInboxNamespace;
  readonly operationalHealth: IOperationalHealthNamespace;
  readonly eval: IEvalNamespace;
  readonly permissions: IPermissionsNamespace;

  /** Whether this context may register only durable execution dependencies. */
  readonly executionOnly: boolean;

  /** Logger instance for this plugin */
  readonly logger: Logger;

  /**
   * Where this Brain's Git checkout owner listens, or undefined when it has
   * none. A runtime endpoint the shell resolves, so no plugin has to read
   * the environment to find it.
   */
  readonly gitBrokerSocket: string | undefined;

  /** Absolute path owned by the Git broker, assigned with its socket. */
  readonly gitBrokerCheckout: string | undefined;

  /** Active resolved theme CSS for site, dashboard, and media rendering. */
  readonly themeCSS: string;

  /** Whether this process serves the brain's HTTP surface. */
  readonly servesHttp: boolean;

  /** Entity display metadata from the active site package, if any */
  readonly entityDisplay: Record<string, EntityDisplayEntry> | undefined;

  /** Shared conversation spaces for this brain/team */
  readonly spaces: string[];

  /** Runtime dependency readiness and bounded resource signals. */
  readonly readiness: () => Promise<RuntimeReadiness>;

  // ============================================================================
  // Entity Service (Read-Only)
  // ============================================================================

  /** Core entity service with read-only operations */
  readonly entityService: ICoreEntityService;

  // ============================================================================
  // Brain Identity & Profile
  // ============================================================================

  /** App-scoped semantic profile-kind catalog and selected resolution. */
  readonly profileKinds: IProfileKindsNamespace;

  /** Public card skills shared by every publication channel. */
  readonly publicSkills: IPublicSkillsNamespace;

  /** Destination-owned non-mutating Inbox follow-up catalog. */
  readonly inboxFollowUps: IInboxFollowUpsNamespace;

  // ============================================================================
  // Inter-Plugin Messaging
  // ============================================================================

  /**
   * Messaging namespace
   * - `messaging.broadcast()` - Broadcast an event on its typed channel
   * - `messaging.request/gather/command/answer()` - Cross-plugin calls through bus contracts
   * - `messaging.subscribe()` - Subscribe to messages on a channel
   */
  readonly messaging: IMessagingNamespace;

  /** Dashboard widget contribution */
  readonly dashboard: IDashboardNamespace;

  /** Studio workspace contribution */
  readonly studio: IStudioNamespace;

  // ============================================================================
  // Job Queue (monitoring + scoped write)
  // ============================================================================

  /** Job operations — monitoring + plugin-scoped enqueue/registerHandler */
  readonly jobs: JobsNamespace;

  /** Who starts a package job; its reads run with that requester's access. */
  readonly jobAuthority: IJobAuthorityNamespace;

  // ============================================================================
  // Source-derived Attachments
  // ============================================================================

  /** Source-derived publish attachment resolution namespace */
  readonly attachments: IAttachmentsNamespace;

  // ============================================================================
  // Runtime Uploads
  // ============================================================================

  /** Ephemeral runtime upload storage namespace. */
  readonly uploads: IRuntimeUploadsNamespace;

  // ============================================================================
  // Runtime State
  // ============================================================================

  /** Internal app-scoped per-account settings catalog and runtime access. */
  readonly accountSettings: AccountSettingsRegistry;

  /** The brain's auth backend: people, sessions, audit log and A2A trust. */
  readonly auth: IAuthNamespace;
  /** AT Protocol projections of entity types, published by the atproto plugin. */
  readonly atprotoProjections: AtprotoProjectionRegistry;

  /** Disposable, secret-free operational state namespace. */
  readonly runtimeState: IRuntimeStateNamespace;

  /** Shell-owned recurring checks registered by this plugin. */
  readonly recurringChecks: IRecurringChecksNamespace;

  // ============================================================================
  // Conversations (Read-Only)
  // ============================================================================

  /**
   * Conversations namespace
   * - `conversations.get()` - Get a conversation by ID
   * - `conversations.search()` - Search conversations by query
   * - `conversations.getMessages()` - Get messages from a conversation
   */
  readonly conversations: IConversationsNamespace;

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Analytics namespace
   * - `analytics.register()` - Add a report to `system_analytics`
   */
  readonly analytics: IAnalyticsNamespace;

  /** Read-only resolved plugin capabilities. */
  readonly plugins: IPluginsNamespace;

  // ============================================================================
  // Endpoint Advertisement
  // ============================================================================

  /**
   * Endpoints namespace — advertise this plugin's user-facing URLs
   * so they surface in `appInfo.endpoints` for the dashboard and
   * other operator-facing consumers.
   */
  readonly endpoints: IEndpointsNamespace;

  /**
   * Interactions namespace — advertise user/agent entry points for this brain.
   */
  readonly interactions: IInteractionsNamespace;
}

/**
 * Create a BasePluginContext from the shell.
 *
 * Used by all three sibling context factories (entity, service, interface).
 */
export function createBasePluginContext(
  shell: IShell,
  pluginId: string,
  registrationContext?: PluginRegistrationContext,
): BasePluginContext {
  const entityService = shell.getEntityService();
  const logger = shell.getLogger().child(pluginId);
  const domain = shell.getDomain();
  const localSiteUrl = shell.getLocalSiteUrl();
  const preferLocalUrls = shell.shouldPreferLocalUrls();
  const production = shell.isProduction();
  const themeCSS = shell.getThemeCSS();
  const getAppInfo = createAppInfoGetter(shell);
  const attachments = shell.getAttachmentRegistry();
  const uploads = shell.getRuntimeUploadRegistry();
  const runtimeState = shell.getRuntimeState();
  const accountSettings = shell.getAccountSettingsRegistry();
  const executionOnly = registrationContext?.executionOnly === true;
  const messaging = createMessagingNamespace(
    shell,
    pluginId,
    logger,
    executionOnly,
  );

  return {
    pluginId,
    executionOnly,
    logger,
    entityService,

    semantic: {
      project: (request) => entityService.projectSemanticSpace(request),
    },

    identity: createIdentityNamespace(shell, getAppInfo),
    profileKinds: createProfileKindsNamespace(shell, pluginId),
    channels: createChannelsNamespace(shell),
    publicSkills: createPublicSkillsNamespace(shell),
    inbox: createInboxNamespace(shell, pluginId),
    inboxFollowUps: createInboxFollowUpsNamespace(shell, pluginId),

    appInfo: getAppInfo,
    readiness: () => shell.getRuntimeReadiness(),
    operationalHealth: createOperationalHealthNamespace(shell, pluginId),
    judge: (input) => shell.judge(input),

    domain,
    siteUrl: domain ? `https://${domain}` : undefined,
    localSiteUrl,
    previewUrl: domain ? `https://${derivePreviewDomain(domain)}` : undefined,
    preferLocalUrls,
    production,
    servesHttp: shell.servesHttp(),
    themeCSS,
    entityDisplay: registrationContext?.entityDisplay,
    spaces: shell.getSpaces(),

    permissions: createPermissionsNamespace(shell),

    messaging,

    dashboard: createDashboardNamespace(
      messaging,
      pluginId,
      (channel) => shell.getMessageBus().hasHandlers?.(channel) ?? false,
    ),
    studio: createStudioNamespace(
      messaging,
      pluginId,
      (channel) => shell.getMessageBus().hasHandlers?.(channel) ?? false,
    ),

    jobs: createJobsNamespace(shell, pluginId),
    jobAuthority: createJobAuthorityNamespace(shell, pluginId),

    attachments,

    uploads,

    accountSettings,
    auth: shell.getAuthRegistry(),
    atprotoProjections: shell.getAtprotoProjectionRegistry(),
    runtimeState,
    recurringChecks: shell.getRecurringChecks(pluginId),

    conversations: createConversationsNamespace(shell),

    dataDir: shell.getDataDir(),
    gitBrokerSocket: shell.getGitBrokerSocket(),
    gitBrokerCheckout: shell.getGitBrokerCheckout(),

    eval: executionOnly
      ? { registerHandler: (): void => {} }
      : createEvalNamespace(shell, pluginId),

    analytics: executionOnly
      ? { register: (): void => {} }
      : createAnalyticsNamespace(shell),

    plugins: createPluginsNamespace(shell),

    endpoints: executionOnly
      ? { register: (): void => {} }
      : createEndpointsNamespace(shell, pluginId),
    interactions: executionOnly
      ? { register: (): void => {} }
      : createInteractionsNamespace(shell, pluginId),
  };
}
