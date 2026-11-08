import {
  ServicePlugin,
  type ServicePluginContext,
  type WebRouteDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { LinkedInClient, type LinkedInFetch } from "./lib/linkedin-client";
import { LinkedInConnections } from "./lib/linkedin-connection";
import { LinkedInBrokerClient } from "./lib/linkedin-broker";
import { createOAuthStates, LinkedInOAuthClient } from "./lib/linkedin-oauth";
import { ProfileImport } from "./lib/profile-import";
import {
  BROKER_RETURN_PATH,
  CALLBACK_PATH,
  createOAuthRoutes,
  START_PATH,
  type ConsentMode,
} from "./oauth-routes";
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

const brokerConfigSchema: z.ZodObject<{
  url: z.ZodURL;
  instanceId: z.ZodString;
  secret: z.ZodString;
  returnUri: z.ZodURL;
}> = z.object({
  url: z.url({ protocol: /^https$/ }).describe("The managed broker's origin"),
  instanceId: z.string().trim().min(1).describe("This brain's broker instance"),
  secret: z.string().min(32).describe("This brain's broker instance secret"),
  returnUri: z
    .url({ protocol: /^https?$/ })
    .describe(
      `This brain's return URL ending at ${BROKER_RETURN_PATH}, registered with the broker`,
    ),
});

const linkedInImportConfigSchema: z.ZodObject<{
  oauth: z.ZodOptional<typeof oauthConfigSchema>;
  broker: z.ZodOptional<typeof brokerConfigSchema>;
}> = z.object({
  oauth: oauthConfigSchema
    .optional()
    .describe("The instance's own LinkedIn app, for direct-mode OAuth"),
  broker: brokerConfigSchema
    .optional()
    .describe("The managed broker holding the shared LinkedIn app"),
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
  private readonly states = createOAuthStates();
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
    const { oauth, broker } = this.config;
    if (oauth && broker) {
      throw new Error(
        "linkedin-import: configure either oauth (direct) or broker, not both",
      );
    }
    if (!oauth && !broker) return;
    if (oauth && new URL(oauth.redirectUri).pathname !== CALLBACK_PATH) {
      throw new Error(
        `linkedin-import: oauth.redirectUri must end at ${CALLBACK_PATH}`,
      );
    }
    if (broker && new URL(broker.returnUri).pathname !== BROKER_RETURN_PATH) {
      throw new Error(
        `linkedin-import: broker.returnUri must end at ${BROKER_RETURN_PATH}`,
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
    const ownUrl =
      this.config.oauth?.redirectUri ?? this.config.broker?.returnUri;
    if (!ownUrl || !this.connections) return;
    const url = await registerLinkedInWorkspace(context, {
      profileImport: new ProfileImport(context.messaging, this.deps.fetch),
      clientFor: (accessToken) =>
        new LinkedInClient(accessToken, this.deps.fetch),
      connections: this.connections,
      startUrl: new URL(START_PATH, ownUrl).toString(),
    });
    if (url) this.workspaceUrl = url;
  }

  override getWebRoutes(): WebRouteDefinition[] {
    const mode = this.consentMode();
    const connections = this.connections;
    if (!mode || !connections) return [];
    return createOAuthRoutes({
      mode,
      states: this.states,
      connections,
      resolveSession: async (request) =>
        this.getContext().auth.get()?.resolveSession(request),
      workspaceUrl: () => this.workspaceUrl,
      now: this.deps.now ?? Date.now,
      logger: this.logger,
    });
  }

  private consentMode(): ConsentMode | null {
    const { oauth, broker } = this.config;
    if (oauth) {
      return {
        kind: "direct",
        oauth: new LinkedInOAuthClient(oauth, this.deps.fetch),
      };
    }
    if (broker) {
      return {
        kind: "broker",
        broker: new LinkedInBrokerClient(broker, this.deps.fetch),
      };
    }
    return null;
  }
}

export function linkedInImportPlugin(
  config: LinkedInImportConfigInput = {},
  deps: LinkedInImportDeps = {},
): LinkedInImportPlugin {
  return new LinkedInImportPlugin(config, deps);
}
