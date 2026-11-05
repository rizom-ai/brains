import {
  ServicePlugin,
  type ServicePluginContext,
  type WebRouteDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { LinkedInClient, type LinkedInFetch } from "./lib/linkedin-client";
import { LinkedInConnections } from "./lib/linkedin-connection";
import { LinkedInOAuthClient, OAuthStateStore } from "./lib/linkedin-oauth";
import { ProfileImport } from "./lib/profile-import";
import { CALLBACK_PATH, createOAuthRoutes, START_PATH } from "./oauth-routes";
import { registerLinkedInWorkspace } from "./workspace";
import packageJson from "../package.json";

const DEFAULT_WORKSPACE_URL = "/studio";

const oauthConfigSchema: z.ZodObject<{
  clientId: z.ZodString;
  clientSecret: z.ZodString;
  redirectUri: z.ZodURL;
}> = z.object({
  clientId: z.string().trim().min(1).describe("LinkedIn app client ID"),
  clientSecret: z.string().trim().min(1).describe("LinkedIn app client secret"),
  redirectUri: z
    .url({ protocol: /^https?$/ })
    .describe(
      `This brain's callback URL ending at ${CALLBACK_PATH}, registered with the LinkedIn app`,
    ),
});

const linkedInImportConfigSchema: z.ZodObject<{
  oauth: z.ZodOptional<typeof oauthConfigSchema>;
}> = z.object({
  oauth: oauthConfigSchema
    .optional()
    .describe("The instance's own LinkedIn app, for direct-mode OAuth"),
});

type LinkedInImportConfig = z.output<typeof linkedInImportConfigSchema>;
type LinkedInImportConfigInput = z.input<typeof linkedInImportConfigSchema>;

export interface LinkedInImportDeps {
  fetch?: LinkedInFetch;
  now?: () => number;
}

/**
 * Imports the owner's LinkedIn profile into the anchor profile. The Anchor
 * connects LinkedIn from a Studio workspace only they see; the token stays in
 * their account settings. Inert without the instance's LinkedIn app.
 */
export class LinkedInImportPlugin extends ServicePlugin<
  LinkedInImportConfig,
  LinkedInImportConfigInput
> {
  private readonly deps: LinkedInImportDeps;
  private readonly states = new OAuthStateStore();
  private connections: LinkedInConnections | undefined;
  private workspaceUrl = DEFAULT_WORKSPACE_URL;

  constructor(
    config: LinkedInImportConfigInput = {},
    deps: LinkedInImportDeps = {},
  ) {
    super("linkedin-import", packageJson, config, linkedInImportConfigSchema);
    this.deps = deps;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!this.config.oauth) return;
    if (new URL(this.config.oauth.redirectUri).pathname !== CALLBACK_PATH) {
      throw new Error(
        `linkedin-import: oauth.redirectUri must end at ${CALLBACK_PATH}`,
      );
    }
    this.connections = new LinkedInConnections(context.accountSettings, {
      pluginId: this.id,
      packageName: packageJson.name,
    });
  }

  protected override async onRegistrationComplete(
    context: ServicePluginContext,
  ): Promise<void> {
    const { oauth } = this.config;
    if (!oauth || !this.connections) return;
    const url = await registerLinkedInWorkspace(context, {
      profileImport: new ProfileImport(context.entityService, this.deps.fetch),
      clientFor: (accessToken) =>
        new LinkedInClient(accessToken, this.deps.fetch),
      connections: this.connections,
      startUrl: new URL(START_PATH, oauth.redirectUri).toString(),
    });
    if (url) this.workspaceUrl = url;
  }

  override getWebRoutes(): WebRouteDefinition[] {
    const { oauth } = this.config;
    const connections = this.connections;
    if (!oauth || !connections) return [];
    return createOAuthRoutes({
      oauth: new LinkedInOAuthClient(oauth, this.deps.fetch),
      states: this.states,
      connections,
      resolveSession: async (request) =>
        this.getContext().auth.get()?.resolveSession(request),
      workspaceUrl: () => this.workspaceUrl,
      now: this.deps.now ?? Date.now,
      logger: this.logger,
    });
  }
}

export function linkedInImportPlugin(
  config: LinkedInImportConfigInput = {},
  deps: LinkedInImportDeps = {},
): LinkedInImportPlugin {
  return new LinkedInImportPlugin(config, deps);
}
