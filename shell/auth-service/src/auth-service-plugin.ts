import {
  defineServicePlugin,
  deriveConsoleSurfaces,
  instantiatePluginPackageDefinition,
  internalFullScope,
  serviceRuntime,
  withAuthAuthority,
  withTools,
  withWebRoutes,
  type Plugin,
  type RegisteredWebRoute,
  type ServicePackageDefinition,
  type ServiceRuntime,
} from "@brains/plugins";
import { join } from "node:path";
import { authPrincipalResolveContract } from "@brains/contracts";
import { notificationsSendContract } from "@brains/contracts";
import type {
  ChannelDeliveryProvider,
  ChannelDescriptor,
  Tool,
  WebRouteDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { AUTH_BRAIN_ANCHOR_CONFIG_KINDS } from "@brains/contracts";
import { AuthService } from "./auth-service";
import type { AuthRuntimeReplicaOptions } from "./runtime-db";
import { DEFAULT_SETUP_TOKEN_TTL_SECONDS } from "./setup-flow";
import {
  renderOnboardingEmail,
  type OnboardingDetails,
} from "./onboarding-emails";
import {
  CHAT_INTERACTION_ID,
  MCP_INTERACTION_ID,
  STUDIO_INTERACTION_ID,
  studioAiToolsHref,
} from "@brains/contracts";
import packageJson from "../package.json";

/** First-passkey setup email recipient. The email's copy is built in. */
const setupEmailSchema: z.ZodString = z.string().email();

const authRuntimeReplicaSchema: z.ZodObject<
  {
    syncUrl: z.ZodString;
    authToken: z.ZodString;
    syncIntervalMs: z.ZodOptional<z.ZodNumber>;
  },
  z.core.$strict
> = z
  .object({
    /** Private remote libSQL primary URL. */
    syncUrl: z
      .string()
      .url()
      .regex(/^(?:libsql|https):\/\//),
    /** Authentication token for the private remote primary. */
    authToken: z.string().min(1),
    /** Remote-to-local sync cadence in milliseconds. */
    syncIntervalMs: z.number().int().positive().optional(),
  })
  .strict();

// The replica options belong to the runtime database; the config schema must
// accept every value typed by them and yield nothing outside them.
function expectReplicaOptions(
  value: z.output<typeof authRuntimeReplicaSchema>,
): AuthRuntimeReplicaOptions {
  return value;
}
function expectReplicaOptionsInput(
  value: AuthRuntimeReplicaOptions,
): z.input<typeof authRuntimeReplicaSchema> {
  return value;
}
void expectReplicaOptions;
void expectReplicaOptionsInput;

export const authServiceConfigSchema: z.ZodObject<{
  issuer: z.ZodOptional<z.ZodString>;
  anchor: z.ZodDefault<
    z.ZodEnum<{ person: "person"; team: "team"; organization: "organization" }>
  >;
  trustedIssuers: z.ZodDefault<z.ZodArray<z.ZodString>>;
  allowLocalhostIssuers: z.ZodOptional<z.ZodBoolean>;
  storageDir: z.ZodOptional<z.ZodString>;
  replica: z.ZodOptional<typeof authRuntimeReplicaSchema>;
  setupTokenTtlSeconds: z.ZodDefault<z.ZodNumber>;
  setupEmail: z.ZodOptional<typeof setupEmailSchema>;
  accountSettingsEncryptionKey: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Public issuer origin. Defaults to the brain site URL, then localhost dev. */
  issuer: z.string().optional(),
  /** Config-declared Anchor profile flavor. Team and organization are collective. */
  anchor: z.enum(AUTH_BRAIN_ANCHOR_CONFIG_KINDS).default("person"),
  /** Additional trusted issuer origins, for example a preview host. */
  trustedIssuers: z.array(z.string()).default([]),
  /** Allow localhost/127.0.0.1 request issuers. Defaults to true only for localhost issuers. */
  allowLocalhostIssuers: z.boolean().optional(),
  /** Runtime auth storage directory. Defaults to ./data/auth, outside brain-data/content. */
  storageDir: z.string().optional(),
  /** Private remote libSQL primary for embedded-replica backup and PITR. */
  replica: authRuntimeReplicaSchema.optional(),
  /** First-passkey setup token lifetime in seconds. */
  setupTokenTtlSeconds: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_SETUP_TOKEN_TTL_SECONDS),
  /** Optional first-passkey setup email recipient. */
  setupEmail: setupEmailSchema.optional(),
  /** Deployment secret for encrypted per-account plugin settings. */
  accountSettingsEncryptionKey: z.string().min(32).optional(),
});

export type AuthServiceConfig = z.output<typeof authServiceConfigSchema>;
export type AuthServiceConfigInput = z.input<typeof authServiceConfigSchema>;

type PasskeySetupToolData =
  | { status: "setup_required"; setupUrl: string; expiresAt: number }
  | { status: "complete" }
  | { status: "unavailable"; reason: string };

interface PasskeySetupToolResponse {
  success: true;
  data: PasskeySetupToolData;
}

export function resolveAuthStorageDir(configured: string | undefined): string {
  return configured ?? join(".", "data", "auth");
}

/**
 * What onboarding emails say about the brain: its character's purpose, and the
 * chat, Studio and AI tools pages it serves. A page the brain does not serve
 * is left out; AI tools needs both Studio and MCP over HTTP.
 */
async function resolveOnboardingDetails(
  runtime: ServiceRuntime,
): Promise<OnboardingDetails> {
  const purpose = runtime.identity.get().purpose.trim();
  const interactions =
    (await runtime.identity.getAppInfo().catch(() => undefined))
      ?.interactions ?? [];
  const href = (id: string): string | undefined =>
    interactions.find(
      (interaction) =>
        interaction.id === id && interaction.href.startsWith("/"),
    )?.href;
  const chat = href(CHAT_INTERACTION_ID);
  const studio = href(STUDIO_INTERACTION_ID);
  const aiTools =
    studio && href(MCP_INTERACTION_ID) ? studioAiToolsHref(studio) : undefined;
  return {
    ...(purpose ? { purpose } : {}),
    links: {
      ...(chat ? { chat } : {}),
      ...(studio ? { studio } : {}),
      ...(aiTools ? { aiTools } : {}),
    },
  };
}

async function resolveProfileDisplayName(
  runtime: ServiceRuntime,
  profileEntityId: string,
): Promise<string | undefined> {
  if (profileEntityId === "anchor-profile/anchor-profile") {
    const name = runtime.identity.getProfile().name.trim();
    return name && name !== "Unknown" ? name : undefined;
  }

  const separator = profileEntityId.indexOf("/");
  if (separator <= 0 || separator === profileEntityId.length - 1) {
    return undefined;
  }
  const entity = await runtime.entityReads.getEntity({
    entityType: profileEntityId.slice(0, separator),
    id: profileEntityId.slice(separator + 1),
    visibilityScope: internalFullScope("profile display name for auth admin"),
  });
  const name = entity?.metadata["name"];
  return typeof name === "string" ? name : undefined;
}

/** Where a newly registered operator lands: Studio when the brain serves it. */
export function homePathFor(
  routes: readonly Pick<RegisteredWebRoute, "fullPath" | "definition">[],
): string {
  return (
    deriveConsoleSurfaces(routes, {
      activeId: "auth-service",
      permissionLevel: "admin",
      hasActiveSession: true,
    }).find((surface) => surface.id === "studio")?.href ?? "/"
  );
}

/** What the auth service keeps once it has set up: its service and its tools' state. */
interface AuthServiceState {
  readonly service: AuthService;
  readonly hasPasskeyCredentials: boolean;
}

async function requestSetupEmailIfNeeded(
  runtime: ServiceRuntime,
  config: AuthServiceConfig,
  service: AuthService,
): Promise<void> {
  if (!config.setupEmail) return;
  if (await service.hasPasskeyCredentials()) return;

  const setup = await service.getPasskeySetupRequiredForDelivery();
  if (!setup) return;

  const recipient = config.setupEmail;
  if (await service.hasSetupEmailDelivery(setup.setupTokenId, recipient)) {
    return;
  }

  const greetingName =
    config.anchor === "person"
      ? await resolveProfileDisplayName(
          runtime,
          "anchor-profile/anchor-profile",
        )
      : undefined;
  const { links } = await resolveOnboardingDetails(runtime);
  const email = renderOnboardingEmail({
    kind: "anchor-setup",
    setupUrl: setup.setupUrl,
    expiresAt: setup.expiresAt,
    links,
    ...(greetingName ? { greetingName } : {}),
  });
  const delivered = await runtime.messaging.request(notificationsSendContract, {
    recipient: { type: "email", address: recipient },
    title: email.subject,
    body: email.text,
    html: email.html,
    sensitivity: "secret",
  });
  if (delivered.status !== "answered" || delivered.data.status !== "sent") {
    runtime.logger.warn("Passkey setup email delivery was not confirmed");
    return;
  }

  await service.recordSetupEmailDelivery(
    setup.setupTokenId,
    recipient,
    delivered.data.deliveryId ? { deliveryId: delivered.data.deliveryId } : {},
  );
}

/**
 * The brain's auth service: passkeys, OAuth for MCP clients, sessions, the
 * account and administration endpoints, and the backends the brain reads
 * identity and account settings through, which it binds as the brain's auth
 * authority.
 */
const authServiceDefinition = defineServicePlugin({
  id: "auth-service",
  config: authServiceConfigSchema,
  setup: async (context): Promise<AuthServiceState> => {
    const { config } = context;
    const runtime = serviceRuntime(context);
    const { authAuthority } = runtime;
    const issuer =
      config.issuer ??
      (runtime.preferLocalUrls
        ? (runtime.localSiteUrl ?? runtime.siteUrl)
        : (runtime.siteUrl ?? runtime.localSiteUrl));
    const service = new AuthService({
      storageDir: resolveAuthStorageDir(config.storageDir),
      ...(config.replica ? { replica: config.replica } : {}),
      anchor: config.anchor,
      anchorProfileEntityId: "anchor-profile/anchor-profile",
      resolveProfileDisplayName: (
        profileEntityId,
      ): Promise<string | undefined> =>
        resolveProfileDisplayName(runtime, profileEntityId),
      ...(issuer ? { issuer } : {}),
      trustedIssuers: config.trustedIssuers,
      ...(config.allowLocalhostIssuers !== undefined
        ? { allowLocalhostIssuers: config.allowLocalhostIssuers }
        : {}),
      setupTokenTtlSeconds: config.setupTokenTtlSeconds,
      resolveHomePath: (): string =>
        runtime
          .consoleSurfaces({
            activeId: "auth-service",
            permissionLevel: "admin",
            hasActiveSession: true,
          })
          .find((surface) => surface.id === "studio")?.href ?? "/",
      ...(config.accountSettingsEncryptionKey
        ? {
            accountSettingsEncryptionKey: config.accountSettingsEncryptionKey,
          }
        : {}),
      onAccountDeleted: (actorId): void => {
        authAuthority.accountSettings.accountDeleted(actorId);
      },
      accountSettingsRegistry: authAuthority.accountSettings.registry,
      autoStartInvitationDeliveryRecovery: false,
      // The worker serves no `/setup`; a token it issued would replace the
      // one whose link the web process logged.
      issuesSetupLinks: !runtime.executionOnly,
      getInvitationDeliveryProvider: (
        channelType,
      ): ChannelDeliveryProvider | undefined =>
        runtime.deliveryProvider(channelType),
      getChannelDescriptor: (channelType): ChannelDescriptor | undefined =>
        runtime.channelDescriptor(channelType),
      listChannelDescriptors: (): ChannelDescriptor[] =>
        runtime.channelDescriptors(),
      isChannelTypeRegistered: (channelType): boolean =>
        Boolean(runtime.channelDescriptor(channelType)),
      getOnboardingDetails: (): Promise<OnboardingDetails> =>
        resolveOnboardingDetails(runtime),
      logger: runtime.logger,
    });
    await service.initialize();
    // Closed last, once every binding to it is released.
    context.lifecycle.onCleanup(() => service.close());
    const accountSettingsBackend = service.getAccountSettingsBackend();
    if (accountSettingsBackend) {
      authAuthority.accountSettings.bindBackend(accountSettingsBackend);
    }
    const principalState =
      await service.initializeConfiguredInterfacePrincipals(
        authAuthority.principals.configuredSeeds(),
      );
    authAuthority.principals.replaceRuntimeState(principalState);
    authAuthority.bind(service);

    runtime.answer(authPrincipalResolveContract, async ({ request }) => {
      const principal = await service.resolveActorPrincipal(request.actor);
      return {
        principal: principal
          ? {
              userId: principal.userId,
              personId: principal.personId,
              ...(principal.canonicalId
                ? { canonicalId: principal.canonicalId }
                : {}),
              displayName: principal.displayName,
              permissionLevel: principal.permissionLevel,
            }
          : null,
      };
    });
    runtime.registered(() => service.startInvitationDeliveryRecovery());
    runtime.ready(() => requestSetupEmailIfNeeded(runtime, config, service));

    return {
      service,
      hasPasskeyCredentials: await service.hasPasskeyCredentials(),
    };
  },
});

/** The tool its class registered under its own name. */
const withAuthTools = withTools<
  typeof authServiceConfigSchema,
  AuthServiceState
>(withAuthAuthority(authServiceDefinition), ({ state }): readonly Tool[] => [
  {
    name: "auth-service_get_passkey_setup_url",
    description:
      "Get the first-passkey setup URL when passkey setup is required. Admin-only.",
    inputSchema: {},
    visibility: "admin",
    ...(state.hasPasskeyCredentials ? { agentTool: false } : {}),
    handler: async (): Promise<PasskeySetupToolResponse> => {
      const { service } = state;
      if (await service.hasPasskeyCredentials()) {
        return {
          success: true,
          data: { status: "complete" as const },
        };
      }

      const setup = await service.getPasskeySetupRequired();
      if (setup) {
        return {
          success: true,
          data: {
            status: "setup_required" as const,
            setupUrl: setup.setupUrl,
            expiresAt: setup.expiresAt,
          },
        };
      }

      return {
        success: true,
        data: {
          status: "unavailable" as const,
          reason: "Passkey setup URL is not available.",
        },
      };
    },
    sideEffects: "none",
  } satisfies Tool<PasskeySetupToolResponse>,
]);

/** The auth service's declared package: the routes its class served. */
export const authServicePackage: ServicePackageDefinition<
  typeof authServiceConfigSchema
> = withWebRoutes<typeof authServiceConfigSchema, AuthServiceState>(
  withAuthTools,
  ({ state }): readonly WebRouteDefinition[] => {
    const handler = (request: Request): Promise<Response> =>
      state.service.handleRequest(request);
    return [
      {
        path: "/.well-known/oauth-authorization-server",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/.well-known/oauth-authorization-server",
        method: "OPTIONS",
        public: true,
        handler,
      },
      {
        path: "/.well-known/jwks.json",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/.well-known/jwks.json",
        method: "OPTIONS",
        public: true,
        handler,
      },
      {
        path: "/.well-known/oauth-protected-resource",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/.well-known/oauth-protected-resource",
        method: "OPTIONS",
        public: true,
        handler,
      },
      {
        path: "/setup",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/login",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/logout",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/logout",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/authorize",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/authorize",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/register",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/register",
        method: "OPTIONS",
        public: true,
        handler,
      },
      {
        path: "/token",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/token",
        method: "OPTIONS",
        public: true,
        handler,
      },
      {
        path: "/revoke",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/revoke",
        method: "OPTIONS",
        public: true,
        handler,
      },
      {
        path: "/auth/account",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/auth/account/mutations",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/auth/account/plugin-settings",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/auth/account/passkeys/options",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/auth/account/passkeys/verify",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/auth/admin/anchor",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/auth/admin/users",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/auth/admin/audit",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/auth/admin/channels",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/auth/admin/mutations",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/auth/admin/reconciliation",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/webauthn/register/options",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/webauthn/register/verify",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/webauthn/auth/options",
        method: "POST",
        public: true,
        handler,
      },
      {
        path: "/webauthn/auth/verify",
        method: "POST",
        public: true,
        handler,
      },
    ];
  },
);

/** The auth service, installed under the plugin id its class had. */
export function authServicePlugin(config: AuthServiceConfigInput = {}): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    authServicePackage,
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "auth-service" },
  );
  if (!plugin) throw new Error("The auth service did not install");
  return plugin;
}

/** The auth service a brain bound, read from its auth registry. */
export function authServiceOf(registry: { get(): unknown }): AuthService {
  const service = registry.get();
  if (!(service instanceof AuthService)) {
    throw new Error("No auth service is bound");
  }
  return service;
}
