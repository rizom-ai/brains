import type { WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { LinkedInImportJobHandler } from "./handlers/linkedin-import-handler";
import {
  LinkedInClient,
  type LinkedInAccessTokenProvider,
  type LinkedInFetch,
} from "./lib/linkedin-client";
import { LinkedInBrokerClient } from "./lib/linkedin-broker-client";
import {
  LinkedInOAuthClient,
  type LinkedInOAuthTokenStore,
} from "./lib/linkedin-oauth-client";
import {
  createLinkedInOAuthRoutes,
  type LinkedInAnchorSessionResolver,
} from "./lib/linkedin-oauth-routes";
import type { LinkedInOAuthStateStore } from "./lib/linkedin-oauth-state-store";
import packageJson from "../package.json" with { type: "json" };

export interface LinkedInBrokerOAuthConfig {
  mode: "broker";
  baseUrl: string;
  instanceId: string;
  instanceSecret: string;
}

export interface LinkedInDirectOAuthConfig {
  mode: "direct";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export type LinkedInOAuthConfig =
  LinkedInBrokerOAuthConfig | LinkedInDirectOAuthConfig;

export interface LinkedInImportConfig {
  accessToken?: string | undefined;
  oauth?: LinkedInOAuthConfig | undefined;
}

export type LinkedInImportConfigInput = LinkedInImportConfig;

const linkedinOAuthConfigSchema: z.ZodType<
  LinkedInOAuthConfig,
  LinkedInOAuthConfig
> = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("broker"),
      baseUrl: z.url(),
      instanceId: z
        .string()
        .trim()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
      instanceSecret: z.string().trim().min(32),
    })
    .strict(),
  z
    .object({
      mode: z.literal("direct"),
      clientId: z.string().trim().min(1),
      clientSecret: z.string().trim().min(1),
      redirectUri: z.url(),
    })
    .strict(),
]);

const linkedinImportConfigSchema: z.ZodType<
  LinkedInImportConfig,
  LinkedInImportConfigInput
> = z
  .object({
    accessToken: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("LinkedIn member data portability access token"),
    oauth: linkedinOAuthConfigSchema.optional(),
  })
  .strict();

export interface LinkedInImportDeps {
  fetch?: LinkedInFetch | undefined;
  accessTokenProvider?: LinkedInAccessTokenProvider | undefined;
  oauthTokenStore?: LinkedInOAuthTokenStore | undefined;
  oauthStateStore?: LinkedInOAuthStateStore | undefined;
  brokerClient?: LinkedInBrokerClient | undefined;
  resolveAnchorSession?: LinkedInAnchorSessionResolver | undefined;
}

export class LinkedInImportPlugin extends ServicePlugin<
  LinkedInImportConfig,
  LinkedInImportConfigInput
> {
  private readonly deps: LinkedInImportDeps;
  private cachedClient: LinkedInClient | null = null;
  private cachedOAuthClient: LinkedInOAuthClient | null = null;
  private cachedBrokerClient: LinkedInBrokerClient | null = null;
  private cachedOAuthRoutes: WebRouteDefinition[] | null = null;

  constructor(
    config: LinkedInImportConfigInput = {},
    deps: LinkedInImportDeps = {},
  ) {
    super("linkedin-import", packageJson, config, linkedinImportConfigSchema);
    this.deps = deps;
  }

  override getWebRoutes(): WebRouteDefinition[] {
    const routeConfig = this.getOAuthRouteConfig();
    if (!routeConfig) return [];
    if (this.cachedOAuthRoutes) return this.cachedOAuthRoutes;

    const commonOptions = {
      tokenStore: routeConfig.tokenStore,
      ...(this.deps.oauthStateStore
        ? { stateStore: this.deps.oauthStateStore }
        : {}),
      resolveAnchorSession: routeConfig.resolveAnchorSession,
      staticAccessTokenConfigured: Boolean(this.config.accessToken),
      reportError: (message: string): void => this.logger.error(message),
    };
    this.cachedOAuthRoutes =
      routeConfig.mode === "broker"
        ? createLinkedInOAuthRoutes({
            ...commonOptions,
            mode: "broker",
            brokerClient: this.getBrokerClient(
              routeConfig.baseUrl,
              routeConfig.instanceId,
              routeConfig.instanceSecret,
            ),
          })
        : createLinkedInOAuthRoutes({
            ...commonOptions,
            mode: "direct",
            client: this.getOAuthClient(
              routeConfig.clientId,
              routeConfig.clientSecret,
            ),
            redirectUri: routeConfig.redirectUri,
          });
    return this.cachedOAuthRoutes;
  }

  protected override async registerJobHandlers(): Promise<void> {
    if (!this.hasAccessTokenSource()) return;

    const context = this.getContext();
    context.jobs.registerHandler(
      "linkedin-import",
      new LinkedInImportJobHandler(
        this.logger.child("LinkedInImportJobHandler"),
        {
          client: this.getClient(),
          entityService: context.entityService,
        },
      ),
    );
  }

  private hasAccessTokenSource(): boolean {
    return (
      Boolean(this.config.accessToken) ||
      Boolean(this.deps.oauthTokenStore) ||
      Boolean(this.deps.accessTokenProvider)
    );
  }

  private getOAuthRouteConfig():
    | (LinkedInOAuthConfig & {
        tokenStore: LinkedInOAuthTokenStore;
        resolveAnchorSession: LinkedInAnchorSessionResolver;
      })
    | undefined {
    const { oauthTokenStore, resolveAnchorSession } = this.deps;
    if (!oauthTokenStore || !resolveAnchorSession || !this.config.oauth) {
      return undefined;
    }
    return {
      ...this.config.oauth,
      tokenStore: oauthTokenStore,
      resolveAnchorSession,
    };
  }

  private getBrokerClient(
    baseUrl: string,
    instanceId: string,
    instanceSecret: string,
  ): LinkedInBrokerClient {
    this.cachedBrokerClient ??=
      this.deps.brokerClient ??
      new LinkedInBrokerClient({
        baseUrl,
        instanceId,
        instanceSecret,
        fetch: this.deps.fetch ?? globalThis.fetch,
      });
    return this.cachedBrokerClient;
  }

  private getOAuthClient(
    clientId: string,
    clientSecret: string,
  ): LinkedInOAuthClient {
    this.cachedOAuthClient ??= new LinkedInOAuthClient(
      clientId,
      clientSecret,
      this.deps.fetch ?? globalThis.fetch,
    );
    return this.cachedOAuthClient;
  }

  private getClient(): LinkedInClient {
    const accessTokenProvider =
      this.deps.oauthTokenStore ?? this.deps.accessTokenProvider;
    const staticAccessToken = this.config.accessToken;
    this.cachedClient ??= new LinkedInClient(
      accessTokenProvider
        ? {
            getAccessToken: async (): Promise<string | undefined> =>
              (await accessTokenProvider.getAccessToken()) ?? staticAccessToken,
          }
        : (staticAccessToken ?? ""),
      this.deps.fetch ?? globalThis.fetch,
    );
    return this.cachedClient;
  }
}

export function linkedinImportPlugin(
  config: LinkedInImportConfigInput = {},
  deps: LinkedInImportDeps = {},
): LinkedInImportPlugin {
  return new LinkedInImportPlugin(config, deps);
}
