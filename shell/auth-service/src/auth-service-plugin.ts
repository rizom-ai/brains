import {
  NOTIFICATIONS_SEND,
  sendNotificationResultSchema,
} from "@brains/notifications";
import type {
  ServicePluginContext,
  Tool,
  WebRouteDefinition,
} from "@brains/plugins";
import { createTool, ServicePlugin, toolSuccess } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { AuthService, type OperatorSetupRequired } from "./auth-service";
import { DEFAULT_SETUP_TOKEN_TTL_SECONDS } from "./setup-flow";
import packageJson from "../package.json";

const setupEmailSchema = z.union([
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
]);

const authServiceConfigSchema = z.object({
  /** Public issuer origin. Defaults to the brain site URL, then localhost dev. */
  issuer: z.string().optional(),
  /** Additional trusted issuer origins, for example a preview host. */
  trustedIssuers: z.array(z.string()).default([]),
  /** Allow localhost/127.0.0.1 request issuers. Defaults to true only for localhost issuers. */
  allowLocalhostIssuers: z.boolean().optional(),
  /** Runtime auth storage directory. Keep this outside brain-data/content. */
  storageDir: z.string().default("./data/auth"),
  /** First-passkey setup token lifetime in seconds. */
  setupTokenTtlSeconds: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_SETUP_TOKEN_TTL_SECONDS),
  /** Optional first-passkey setup email recipient or template. */
  setupEmail: setupEmailSchema.optional(),
});

const getPasskeySetupUrlInputSchema = z.object({});

type PasskeySetupToolData =
  | { status: "setup_required"; setupUrl: string; expiresAt: number }
  | { status: "complete" }
  | { status: "unavailable"; reason: string };

export type AuthServiceConfig = z.infer<typeof authServiceConfigSchema>;

let activeAuthService: AuthService | undefined;

export function getActiveAuthService(): AuthService | undefined {
  return activeAuthService;
}

export class AuthServicePlugin extends ServicePlugin<AuthServiceConfig> {
  private service: AuthService | undefined;

  constructor(config: Partial<AuthServiceConfig> = {}) {
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
      storageDir: this.config.storageDir,
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
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    await this.requestSetupEmailIfNeeded(context);
  }

  protected override async onShutdown(): Promise<void> {
    if (activeAuthService === this.service) {
      activeAuthService = undefined;
    }
    this.service = undefined;
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      createTool<typeof getPasskeySetupUrlInputSchema, PasskeySetupToolData>(
        this.id,
        "get_passkey_setup_url",
        "Get the first-passkey setup URL when operator setup is required. Anchor-only.",
        getPasskeySetupUrlInputSchema,
        async () => {
          const service = this.getService();
          if (await service.hasPasskeyCredentials()) {
            return toolSuccess({ status: "complete" as const });
          }

          const setup = await service.getOperatorSetupRequired();
          if (setup) {
            return toolSuccess({
              status: "setup_required" as const,
              setupUrl: setup.setupUrl,
              expiresAt: setup.expiresAt,
            });
          }

          return toolSuccess({
            status: "unavailable" as const,
            reason: "Passkey setup URL is not available.",
          });
        },
        { visibility: "anchor", sideEffects: "none" },
      ),
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

    const setup = await service.getOperatorSetupRequired();
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
  setup: OperatorSetupRequired,
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
  setup: OperatorSetupRequired,
): string {
  const expiresAt = new Date(setup.expiresAt * 1000).toISOString();
  const origin = new URL(setup.setupUrl).origin;
  return template
    .replaceAll("{{setupUrl}}", setup.setupUrl)
    .replaceAll("{{expiresAt}}", expiresAt)
    .replaceAll("{{origin}}", origin);
}

export function authServicePlugin(
  config?: Partial<AuthServiceConfig>,
): AuthServicePlugin {
  return new AuthServicePlugin(config);
}
