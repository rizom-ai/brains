import type {
  ServicePluginContext,
  Tool,
  WebRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { LinkedInDistillationJobHandler } from "./handlers/linkedin-distillation-handler";
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
  LINKEDIN_OAUTH_STATUS_PATH,
  type LinkedInOperatorSessionResolver,
} from "./lib/linkedin-oauth-routes";
import type { LinkedInOAuthStateStore } from "./lib/linkedin-oauth-state-store";
import { createLinkedInImportTools } from "./tools";
import { createLinkedInDistillationTools } from "./tools/distillation";
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
        "Registered LinkedIn callback URL ending in /linkedin/callback",
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
          "LinkedIn OAuth requires oauthClientId, oauthClientSecret, and oauthRedirectUri together",
      });
    }
  });

export interface LinkedInImportDeps {
  fetch?: LinkedInFetch | undefined;
  accessTokenProvider?: LinkedInAccessTokenProvider | undefined;
  oauthTokenStore?: LinkedInOAuthTokenStore | undefined;
  oauthStateStore?: LinkedInOAuthStateStore | undefined;
  resolveOperatorSession?: LinkedInOperatorSessionResolver | undefined;
}

export class LinkedInImportPlugin extends ServicePlugin<
  LinkedInImportConfig,
  LinkedInImportConfigInput
> {
  private readonly deps: LinkedInImportDeps;
  private cachedClient: LinkedInClient | null = null;
  private cachedOAuthClient: LinkedInOAuthClient | null = null;
  private cachedOAuthRoutes: WebRouteDefinition[] | null = null;
  private cachedTools: Tool[] | null = null;

  constructor(
    config: LinkedInImportConfigInput = {},
    deps: LinkedInImportDeps = {},
  ) {
    super("linkedin-import", packageJson, config, linkedinImportConfigSchema);
    this.deps = deps;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    if (!this.hasOAuthRoutes()) return;

    context.endpoints.register({
      label: "LinkedIn import",
      url: LINKEDIN_OAUTH_STATUS_PATH,
      priority: 35,
      visibility: "anchor",
    });
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
      resolveOperatorSession: routeConfig.resolveOperatorSession,
      staticAccessTokenConfigured: Boolean(this.config.accessToken),
      reportError: (message, error): void => this.logger.error(message, error),
    });
    return this.cachedOAuthRoutes;
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.hasAccessTokenSource()) return [];
    if (this.cachedTools) return this.cachedTools;

    const context = this.getContext();
    this.cachedTools = [
      ...createLinkedInImportTools(this.id, {
        client: this.getClient(),
        entityService: context.entityService,
        jobs: context.jobs,
      }),
      ...createLinkedInDistillationTools(this.id, {
        ai: context.ai,
        entityService: context.entityService,
        jobs: context.jobs,
      }),
    ];
    return this.cachedTools;
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
    context.jobs.registerHandler(
      "linkedin-profile-distill",
      new LinkedInDistillationJobHandler(
        this.logger.child("LinkedInDistillationJobHandler"),
        context.entityService,
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

  private hasOAuthRoutes(): boolean {
    return this.getOAuthRouteConfig() !== undefined;
  }

  private getOAuthRouteConfig():
    | {
        oauthClientId: string;
        oauthClientSecret: string;
        oauthRedirectUri: string;
        tokenStore: LinkedInOAuthTokenStore;
        resolveOperatorSession: LinkedInOperatorSessionResolver;
      }
    | undefined {
    const { oauthClientId, oauthClientSecret, oauthRedirectUri } = this.config;
    const { oauthTokenStore, resolveOperatorSession } = this.deps;
    if (
      !oauthClientId ||
      !oauthClientSecret ||
      !oauthRedirectUri ||
      !oauthTokenStore ||
      !resolveOperatorSession
    ) {
      return undefined;
    }
    return {
      oauthClientId,
      oauthClientSecret,
      oauthRedirectUri,
      tokenStore: oauthTokenStore,
      resolveOperatorSession,
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
