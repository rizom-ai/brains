import { join } from "node:path";
import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  authPrincipalResolveRequestSchema,
} from "@brains/contracts";
import {
  NOTIFICATIONS_SEND,
  sendNotificationResultSchema,
} from "@brains/notification-contracts";
import type {
  ServicePluginContext,
  Tool,
  WebRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  AUTH_BRAIN_ANCHOR_CONFIG_KINDS,
  type AuthBrainAnchorConfigKind,
} from "./admin-contracts";
import { AuthService, type PasskeySetupRequired } from "./auth-service";
import { DEFAULT_SETUP_TOKEN_TTL_SECONDS } from "./setup-flow";
import packageJson from "../package.json";

export type SetupEmailConfig =
  | string
  | {
      to: string;
      subject: string;
      body: string;
    };

const setupEmailSchema: z.ZodType<SetupEmailConfig, SetupEmailConfig> = z.union(
  [
    z.string().email(),
    z
      .object({
        /** Setup email recipient. */
        to: z.string().email(),
        /** Notification subject. */
        subject: z.string().min(1),
        /** Notification body template. Supports {{setupUrl}}, {{expiresAt}}, and {{origin}}. */
        body: z.string().min(1),
      })
      .strict(),
  ],
);

export interface AuthServiceConfig {
  issuer?: string | undefined;
  anchor: AuthBrainAnchorConfigKind;
  trustedIssuers: string[];
  allowLocalhostIssuers?: boolean | undefined;
  storageDir?: string | undefined;
  setupTokenTtlSeconds: number;
  setupEmail?: SetupEmailConfig | undefined;
}

export interface AuthServiceConfigInput {
  issuer?: string | undefined;
  anchor?: AuthBrainAnchorConfigKind | undefined;
  trustedIssuers?: string[] | undefined;
  allowLocalhostIssuers?: boolean | undefined;
  storageDir?: string | undefined;
  setupTokenTtlSeconds?: number | undefined;
  setupEmail?: SetupEmailConfig | undefined;
}

const authServiceConfigSchema: z.ZodType<
  AuthServiceConfig,
  AuthServiceConfigInput
> = z.object({
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
  /** First-passkey setup token lifetime in seconds. */
  setupTokenTtlSeconds: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_SETUP_TOKEN_TTL_SECONDS),
  /** Optional first-passkey setup email recipient or template. */
  setupEmail: setupEmailSchema.optional(),
});

type PasskeySetupToolData =
  | { status: "setup_required"; setupUrl: string; expiresAt: number }
  | { status: "complete" }
  | { status: "unavailable"; reason: string };

interface PasskeySetupToolResponse {
  success: true;
  data: PasskeySetupToolData;
}

let activeAuthService: AuthService | undefined;

export function getActiveAuthService(): AuthService | undefined {
  return activeAuthService;
}

export function resolveAuthStorageDir(configured: string | undefined): string {
  return configured ?? join(".", "data", "auth");
}

async function resolveProfileDisplayName(
  context: ServicePluginContext,
  profileEntityId: string,
): Promise<string | undefined> {
  if (profileEntityId === "anchor-profile/anchor-profile") {
    const name = context.identity.getProfile().name.trim();
    return name && name !== "Unknown" ? name : undefined;
  }

  const separator = profileEntityId.indexOf("/");
  if (separator <= 0 || separator === profileEntityId.length - 1) {
    return undefined;
  }
  const entity = await context.entityService.getEntity({
    entityType: profileEntityId.slice(0, separator),
    id: profileEntityId.slice(separator + 1),
    visibilityScope: "restricted",
  });
  const name = entity?.metadata["name"];
  return typeof name === "string" ? name : undefined;
}

export class AuthServicePlugin extends ServicePlugin<
  AuthServiceConfig,
  AuthServiceConfigInput
> {
  private service: AuthService | undefined;
  private unsubscribePrincipalResolver: (() => void) | undefined;

  constructor(config: AuthServiceConfigInput = {}) {
    super("auth-service", packageJson, config, authServiceConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    const issuer =
      this.config.issuer ??
      (context.preferLocalUrls
        ? (context.localSiteUrl ?? context.siteUrl)
        : (context.siteUrl ?? context.localSiteUrl));
    this.service = new AuthService({
      storageDir: resolveAuthStorageDir(this.config.storageDir),
      anchor: this.config.anchor,
      anchorProfileEntityId: "anchor-profile/anchor-profile",
      resolveProfileDisplayName: (
        profileEntityId,
      ): Promise<string | undefined> =>
        resolveProfileDisplayName(context, profileEntityId),
      ...(issuer ? { issuer } : {}),
      trustedIssuers: this.config.trustedIssuers,
      ...(this.config.allowLocalhostIssuers !== undefined
        ? { allowLocalhostIssuers: this.config.allowLocalhostIssuers }
        : {}),
      setupTokenTtlSeconds: this.config.setupTokenTtlSeconds,
      logger: context.logger,
    });
    await this.service.initialize();
    activeAuthService = this.service;

    this.unsubscribePrincipalResolver = context.messaging.subscribe(
      AUTH_PRINCIPAL_RESOLVE_CHANNEL,
      async (message) => {
        const parsed = authPrincipalResolveRequestSchema.safeParse(
          message.payload,
        );
        if (!parsed.success) {
          return { success: false, error: "Invalid auth principal request" };
        }
        const principal = await this.getService().resolveActorPrincipal(
          parsed.data.actor,
        );
        return {
          success: true,
          data: {
            principal: principal
              ? {
                  userId: principal.userId,
                  ...(principal.canonicalId
                    ? { canonicalId: principal.canonicalId }
                    : {}),
                  displayName: principal.displayName,
                }
              : null,
          },
        };
      },
    );
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    await this.requestSetupEmailIfNeeded(context);
  }

  protected override async onShutdown(): Promise<void> {
    this.unsubscribePrincipalResolver?.();
    this.unsubscribePrincipalResolver = undefined;
    if (activeAuthService === this.service) {
      activeAuthService = undefined;
    }
    await this.service?.close();
    this.service = undefined;
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      {
        name: `${this.id}_get_passkey_setup_url`,
        description:
          "Get the first-passkey setup URL when passkey setup is required. Admin-only.",
        inputSchema: {},
        visibility: "admin",
        handler: async (): Promise<PasskeySetupToolResponse> => {
          const service = this.getService();
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
    ];
  }

  override getWebRoutes(): WebRouteDefinition[] {
    const handler = (request: Request): Promise<Response> =>
      this.getService().handleRequest(request);

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
        path: "/auth/representations",
        method: "GET",
        public: true,
        handler,
      },
      {
        path: "/auth/representations",
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
  }

  getService(): AuthService {
    if (!this.service) {
      throw new Error("AuthServicePlugin has not been registered");
    }
    return this.service;
  }

  private async requestSetupEmailIfNeeded(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!this.config.setupEmail) return;

    const service = this.getService();
    if (await service.hasPasskeyCredentials()) return;

    const setup = await service.getPasskeySetupRequiredForDelivery();
    if (!setup) return;

    const setupEmail = resolveSetupEmail(this.config.setupEmail, setup);

    if (
      await service.hasSetupEmailDelivery(setup.setupTokenId, setupEmail.to)
    ) {
      return;
    }

    const response = await context.messaging.send({
      type: NOTIFICATIONS_SEND,
      payload: {
        recipient: { type: "email", address: setupEmail.to },
        title: setupEmail.subject,
        body: setupEmail.body,
        sensitivity: "secret",
      },
    });

    if (!("success" in response) || !response.success || !response.data) {
      context.logger.warn("Passkey setup email delivery was not confirmed");
      return;
    }

    const parsed = sendNotificationResultSchema.safeParse(response.data);
    if (!parsed.success || parsed.data.status !== "sent") {
      context.logger.warn("Passkey setup email delivery was not confirmed");
      return;
    }

    await service.recordSetupEmailDelivery(
      setup.setupTokenId,
      setupEmail.to,
      parsed.data.deliveryId ? { deliveryId: parsed.data.deliveryId } : {},
    );
  }
}

function resolveSetupEmail(
  config: NonNullable<AuthServiceConfig["setupEmail"]>,
  setup: PasskeySetupRequired,
): { to: string; subject: string; body: string } {
  if (typeof config === "string") {
    const expiresAt = new Date(setup.expiresAt * 1000).toISOString();
    const origin = new URL(setup.setupUrl).origin;
    return {
      to: config,
      subject: "Set up your brain passkey",
      body: [
        "Set up your brain passkey using this single-use link:",
        "",
        setup.setupUrl,
        "",
        `This link expires at ${expiresAt}.`,
        `Dashboard: ${origin}/`,
        `MCP endpoint: ${origin}/mcp`,
        "The first successful passkey registration completes setup and closes this link.",
      ].join("\n"),
    };
  }

  return {
    to: config.to,
    subject: interpolateSetupEmailTemplate(config.subject, setup),
    body: interpolateSetupEmailTemplate(config.body, setup),
  };
}

function interpolateSetupEmailTemplate(
  template: string,
  setup: PasskeySetupRequired,
): string {
  const expiresAt = new Date(setup.expiresAt * 1000).toISOString();
  const origin = new URL(setup.setupUrl).origin;
  return template
    .replaceAll("{{setupUrl}}", setup.setupUrl)
    .replaceAll("{{expiresAt}}", expiresAt)
    .replaceAll("{{origin}}", origin);
}

export function authServicePlugin(
  config: AuthServiceConfigInput = {},
): AuthServicePlugin {
  return new AuthServicePlugin(config);
}
