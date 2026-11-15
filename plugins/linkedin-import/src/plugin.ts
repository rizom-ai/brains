import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import {
  serviceRuntime,
  withWebRoutes,
} from "@brains/sdk/internal/service-runtime";
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

export const linkedInImportConfigSchema: z.ZodObject<{
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

export interface LinkedInImportDeps {
  fetch?: LinkedInFetch;
  now?: () => number;
}

/** What the LinkedIn import holds once set up: the routes it serves, if any. */
export interface LinkedInImportState {
  readonly routes: readonly WebRouteDefinition[];
}

/** The consent mode a config names, checked as the class checked it. */
function consentMode(
  config: LinkedInImportConfig,
  deps: LinkedInImportDeps,
): ConsentMode | null {
  const { oauth, broker } = config;
  if (oauth && broker) {
    throw new Error(
      "linkedin-import: configure either oauth (direct) or broker, not both",
    );
  }
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
  if (oauth) {
    return {
      kind: "direct",
      oauth: new LinkedInOAuthClient(oauth, deps.fetch),
    };
  }
  if (broker) {
    return {
      kind: "broker",
      broker: new LinkedInBrokerClient(broker, deps.fetch),
    };
  }
  return null;
}

/**
 * Imports the owner's LinkedIn profile into the anchor profile. The Anchor
 * connects LinkedIn from a Studio workspace only they see; the token stays in
 * their account settings. Inert without the instance's LinkedIn app.
 */
export function createLinkedInImportPackage(
  deps: LinkedInImportDeps = {},
): ServicePackageDefinition<typeof linkedInImportConfigSchema> {
  const service = defineServicePlugin({
    id: "linkedin-import",
    config: linkedInImportConfigSchema,
    setup: (context): LinkedInImportState => {
      const { config } = context;
      const mode = consentMode(config, deps);
      const ownUrl = config.oauth?.redirectUri ?? config.broker?.returnUri;
      if (!mode || !ownUrl) return { routes: [] };
      const runtime = serviceRuntime(context);
      const connections = new LinkedInConnections(runtime.accountSettings, {
        pluginId: runtime.pluginId,
        packageName: packageJson.name,
      });
      let workspaceUrl = DEFAULT_WORKSPACE_URL;
      runtime.registered(async () => {
        const url = await registerLinkedInWorkspace(runtime.studio, {
          profileImport: new ProfileImport(runtime.messaging, deps.fetch),
          clientFor: (accessToken) =>
            new LinkedInClient(accessToken, deps.fetch),
          connections,
          startUrl: new URL(START_PATH, ownUrl).toString(),
        });
        if (url) workspaceUrl = url;
      });
      return {
        routes: createOAuthRoutes({
          mode,
          states: createOAuthStates(),
          connections,
          resolveSession: async (request) =>
            runtime.auth()?.resolveSession(request),
          workspaceUrl: () => workspaceUrl,
          now: deps.now ?? Date.now,
          logger: runtime.logger,
        }),
      };
    },
  });
  return withWebRoutes<typeof linkedInImportConfigSchema, LinkedInImportState>(
    service,
    ({ state }) => state.routes,
  );
}

/** The LinkedIn import, as the catalog installs it. */
export const linkedInImportPackage: ServicePackageDefinition<
  typeof linkedInImportConfigSchema
> = createLinkedInImportPackage();
