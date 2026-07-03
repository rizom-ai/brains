import type { IShell } from "../interfaces";
import { type Logger } from "@brains/utils/logger";
import { derivePreviewDomain } from "@brains/site-composition";
import type { ICoreEntityService } from "@brains/entity-service";
import type { JudgeInput, PluginRegistrationContext } from "../interfaces";
import type { AppInfo } from "../contracts/app-info";
import type { EntityDisplayEntry } from "@brains/site-composition";
import type { JobsNamespace } from "@brains/job-queue";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { IAttachmentsNamespace } from "../service/attachment-registry";
import type { IRuntimeUploadsNamespace } from "../service/upload-registry";
import {
  createAppInfoGetter,
  createConversationsNamespace,
  createEndpointsNamespace,
  createEvalNamespace,
  createIdentityNamespace,
  createInsightsNamespace,
  createInteractionsNamespace,
  createJobsNamespace,
  createMessagingNamespace,
  createPermissionsNamespace,
} from "./namespaces";
import type {
  IConversationsNamespace,
  IEndpointsNamespace,
  IEvalNamespace,
  IIdentityNamespace,
  IInsightsNamespace,
  IInteractionsNamespace,
  IMessagingNamespace,
  IPermissionsNamespace,
} from "./context-types";

export type {
  IConversationsNamespace,
  IEndpointsNamespace,
  IEvalNamespace,
  IIdentityNamespace,
  IInsightsNamespace,
  IInteractionsNamespace,
  IMessagingNamespace,
  IPermissionsNamespace,
  TypedMessageHandler,
} from "./context-types";

/**
 * Base plugin context — shared by all plugin types (Entity, Service, Interface).
 *
 * Contains only capabilities that every plugin needs.
 * AI, templates, views, and transport are on sibling contexts.
 */
export interface BasePluginContext {
  // ============================================================================
  // Plugin Identity
  // ============================================================================

  /** Unique plugin identifier */
  readonly pluginId: string;

  /** Logger instance for this plugin */
  readonly logger: Logger;

  /** Data directory for storing entity files */
  readonly dataDir: string;

  /** Bare domain string (e.g. "yeehaa.io"), undefined for local dev */
  readonly domain: string | undefined;

  /** Production site URL derived from domain (e.g. "https://yeehaa.io"), undefined if no domain */
  readonly siteUrl: string | undefined;

  /** Local runtime site URL (e.g. "http://localhost:8080"), undefined when unavailable */
  readonly localSiteUrl: string | undefined;

  /** Preview site URL derived from domain (e.g. "https://preview.yeehaa.io" or "https://preview.recall.rizom.ai"), undefined if no domain */
  readonly previewUrl: string | undefined;

  /** Prefer local runtime URLs over public domain URLs when both exist. */
  readonly preferLocalUrls: boolean;

  /** Active resolved theme CSS for site, dashboard, and media rendering. */
  readonly themeCSS: string;

  /** Entity display metadata from the active site package, if any */
  readonly entityDisplay: Record<string, EntityDisplayEntry> | undefined;

  /** Shared conversation spaces for this brain/team */
  readonly spaces: string[];

  /** Entity action policy assertions for plugin-owned tools and handlers. */
  readonly permissions: IPermissionsNamespace;

  /** App metadata (version, model, plugins) */
  readonly appInfo: () => Promise<AppInfo>;

  /** Bounded model-as-judge capability; schema-constrained verdicts only. */
  readonly judge: <T>(input: JudgeInput<T>) => Promise<{
    verdict: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  // ============================================================================
  // Entity Service (Read-Only)
  // ============================================================================

  /** Core entity service with read-only operations */
  readonly entityService: ICoreEntityService;

  // ============================================================================
  // Brain Identity & Profile
  // ============================================================================

  /**
   * Identity namespace
   * - `identity.get()` - Get the brain's identity configuration
   * - `identity.getProfile()` - Get the owner's profile
   * - `identity.getAppInfo()` - Get app metadata
   */
  readonly identity: IIdentityNamespace;

  // ============================================================================
  // Inter-Plugin Messaging
  // ============================================================================

  /**
   * Messaging namespace
   * - `messaging.send()` - Send a message to other plugins
   * - `messaging.subscribe()` - Subscribe to messages on a channel
   */
  readonly messaging: IMessagingNamespace;

  // ============================================================================
  // Job Queue (monitoring + scoped write)
  // ============================================================================

  /** Job operations — monitoring + plugin-scoped enqueue/registerHandler */
  readonly jobs: JobsNamespace;

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

  /** Disposable, secret-free operational state namespace. */
  readonly runtimeState: IRuntimeStateNamespace;

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
  // Evaluation
  // ============================================================================

  /**
   * Eval namespace for plugin testing
   * - `eval.registerHandler()` - Register an eval handler
   */
  readonly eval: IEvalNamespace;

  // ============================================================================
  // Insights
  // ============================================================================

  /**
   * Insights namespace
   * - `insights.register()` - Register a domain-specific insight handler
   */
  readonly insights: IInsightsNamespace;

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
  const themeCSS = shell.getThemeCSS();
  const getAppInfo = createAppInfoGetter(shell);
  const attachments = shell.getAttachmentRegistry();
  const uploads = shell.getRuntimeUploadRegistry();
  const runtimeState = shell.getRuntimeState();

  return {
    pluginId,
    logger,
    entityService,

    identity: createIdentityNamespace(shell, getAppInfo),

    appInfo: getAppInfo,
    judge: (input) => shell.judge(input),

    domain,
    siteUrl: domain ? `https://${domain}` : undefined,
    localSiteUrl,
    previewUrl: domain ? `https://${derivePreviewDomain(domain)}` : undefined,
    preferLocalUrls,
    themeCSS,
    entityDisplay: registrationContext?.entityDisplay,
    spaces: shell.getSpaces(),

    permissions: createPermissionsNamespace(shell),

    messaging: createMessagingNamespace(shell, pluginId, logger),

    jobs: createJobsNamespace(shell, pluginId),

    attachments,

    uploads,

    runtimeState,

    conversations: createConversationsNamespace(shell),

    dataDir: shell.getDataDir(),

    eval: createEvalNamespace(shell, pluginId),

    insights: createInsightsNamespace(shell),

    endpoints: createEndpointsNamespace(shell, pluginId),
    interactions: createInteractionsNamespace(shell, pluginId),
  };
}
