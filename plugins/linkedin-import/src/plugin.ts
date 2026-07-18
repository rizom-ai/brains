import type { WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { LinkedInImportJobHandler } from "./handlers/linkedin-import-handler";
import {
  LinkedInClient,
  type LinkedInAccessTokenProvider,
  type LinkedInFetch,
} from "./lib/linkedin-client";
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

export interface LinkedInImportConfig {
  accessToken?: string | undefined;
  oauthClientId?: string | undefined;
  oauthClientSecret?: string | undefined;
  oauthRedirectUri?: string | undefined;
}

export type LinkedInImportConfigInput = LinkedInImportConfig;

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
    oauthClientId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("LinkedIn OAuth application client ID"),
    oauthClientSecret: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("LinkedIn OAuth application client secret"),
    oauthRedirectUri: z
      .url()
      .optional()
      .describe(
        "Direct LinkedIn callback URL ending in /linkedin/oauth/direct/callback",
      ),
  })
  .superRefine((config, context) => {
    const oauthFields = [
      config.oauthClientId,
      config.oauthClientSecret,
      config.oauthRedirectUri,
    ];
    const configuredFields = oauthFields.filter(Boolean).length;
    if (configuredFields > 0 && configuredFields < oauthFields.length) {
      context.addIssue({
        code: "custom",
        message:
          "Direct LinkedIn OAuth requires oauthClientId, oauthClientSecret, and oauthRedirectUri together",
      });
    }
  });

export interface LinkedInImportDeps {
  fetch?: LinkedInFetch | undefined;
  accessTokenProvider?: LinkedInAccessTokenProvider | undefined;
  oauthTokenStore?: LinkedInOAuthTokenStore | undefined;
  oauthStateStore?: LinkedInOAuthStateStore | undefined;
  resolveAnchorSession?: LinkedInAnchorSessionResolver | undefined;
}

export class LinkedInImportPlugin extends ServicePlugin<
  LinkedInImportConfig,
  LinkedInImportConfigInput
> {
  private readonly deps: LinkedInImportDeps;
  private cachedClient: LinkedInClient | null = null;
  private cachedOAuthClient: LinkedInOAuthClient | null = null;
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

    this.cachedOAuthRoutes = createLinkedInOAuthRoutes({
      client: this.getOAuthClient(
        routeConfig.oauthClientId,
        routeConfig.oauthClientSecret,
      ),
      tokenStore: routeConfig.tokenStore,
      ...(this.deps.oauthStateStore
        ? { stateStore: this.deps.oauthStateStore }
        : {}),
      redirectUri: routeConfig.oauthRedirectUri,
      resolveAnchorSession: routeConfig.resolveAnchorSession,
      staticAccessTokenConfigured: Boolean(this.config.accessToken),
      reportError: (message, error): void => this.logger.error(message, error),
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
    | {
        oauthClientId: string;
        oauthClientSecret: string;
        oauthRedirectUri: string;
        tokenStore: LinkedInOAuthTokenStore;
        resolveAnchorSession: LinkedInAnchorSessionResolver;
      }
    | undefined {
    const { oauthClientId, oauthClientSecret, oauthRedirectUri } = this.config;
    const { oauthTokenStore, resolveAnchorSession } = this.deps;
    if (
      !oauthClientId ||
      !oauthClientSecret ||
      !oauthRedirectUri ||
      !oauthTokenStore ||
      !resolveAnchorSession
    ) {
      return undefined;
    }
    return {
      oauthClientId,
      oauthClientSecret,
      oauthRedirectUri,
      tokenStore: oauthTokenStore,
      resolveAnchorSession,
    };
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
