import type {
  ServicePluginContext,
  Tool,
  WebRouteDefinition,
} from "@brains/plugins";
import { createTool, ServicePlugin, toolSuccess } from "@brains/plugins";
import { z } from "@brains/utils";
import { AuthService } from "./auth-service";
import packageJson from "../package.json";

const authServiceConfigSchema = z.object({
  /** Public issuer origin. Defaults to the brain site URL, then localhost dev. */
  issuer: z.string().optional(),
  /** Additional trusted issuer origins, for example a preview host. */
  trustedIssuers: z.array(z.string()).default([]),
  /** Allow localhost/127.0.0.1 request issuers. Defaults to true only for localhost issuers. */
  allowLocalhostIssuers: z.boolean().optional(),
  /** Runtime auth storage directory. Keep this outside brain-data/content. */
  storageDir: z.string().default("./data/auth"),
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

    const issuer = this.config.issuer ?? context.siteUrl;
    this.service = new AuthService({
      storageDir: this.config.storageDir,
      ...(issuer ? { issuer } : {}),
      trustedIssuers: this.config.trustedIssuers,
      ...(this.config.allowLocalhostIssuers !== undefined
        ? { allowLocalhostIssuers: this.config.allowLocalhostIssuers }
        : {}),
      logger: context.logger,
    });
    await this.service.initialize();
    activeAuthService = this.service;
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
        { visibility: "anchor" },
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
        path: "/.well-known/jwks.json",
        method: "GET",
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
        path: "/token",
        method: "POST",
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
}

export function authServicePlugin(
  config?: Partial<AuthServiceConfig>,
): AuthServicePlugin {
  return new AuthServicePlugin(config);
}
