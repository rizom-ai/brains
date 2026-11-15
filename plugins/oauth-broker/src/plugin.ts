import {
  oauthBrokerProviderIdSchema,
  type OAuthBrokerProvider,
} from "@brains/contracts";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import {
  serviceRuntime,
  withWebRoutes,
} from "@brains/sdk/internal/service-runtime";
import { SingleUseStore } from "@brains/utils/single-use-store";
import { z } from "@brains/utils/zod";
import { BrokerInstances } from "./instances";
import {
  createBrokerRoutes,
  type PendingAuthorization,
  type PendingGrant,
} from "./routes";

const AUTHORIZATION_TTL_MS = 10 * 60 * 1000;
const GRANT_TTL_MS = 2 * 60 * 1000;
const MAX_PENDING = 1_000;

const appSchema: z.ZodObject<{
  clientId: z.ZodString;
  clientSecret: z.ZodString;
}> = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
});

export type ProviderAppConfig = z.output<typeof appSchema>;

const instanceSchema: z.ZodObject<{
  id: z.ZodString;
  secret: z.ZodString;
  returnUris: z.ZodRecord<z.ZodString, z.ZodURL>;
}> = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
  secret: z.string().min(32).describe("Revocable instance secret"),
  returnUris: z
    .record(oauthBrokerProviderIdSchema, z.url({ protocol: /^https?$/ }))
    .describe("Per provider, the one address the browser returns to"),
});

export const oauthBrokerConfigSchema: z.ZodObject<{
  publicUrl: z.ZodURL;
  providers: z.ZodDefault<
    z.ZodRecord<typeof oauthBrokerProviderIdSchema, typeof appSchema>
  >;
  instances: z.ZodDefault<z.ZodArray<typeof instanceSchema>>;
}> = z.object({
  publicUrl: z
    .url({ protocol: /^https?$/ })
    .describe("The broker's public origin, where provider callbacks land"),
  providers: z
    .record(oauthBrokerProviderIdSchema, appSchema)
    .default({})
    .describe("Per provider, the shared app the broker holds"),
  instances: z.array(instanceSchema).default([]),
});

type OAuthBrokerConfig = z.output<typeof oauthBrokerConfigSchema>;

/** Builds a provider's adapter from the shared app the broker holds for it. */
export type ProviderFactory = (app: ProviderAppConfig) => OAuthBrokerProvider;

export interface OAuthBrokerDeps {
  providers: Readonly<Record<string, ProviderFactory>>;
  now?: () => number;
}

/** What the broker holds once set up: the routes it serves, if any. */
export interface OAuthBrokerState {
  readonly routes: readonly WebRouteDefinition[];
}

/** Each configured provider's adapter, refusing one without or unlike its id. */
function providersOf(
  config: OAuthBrokerConfig,
  deps: OAuthBrokerDeps,
): OAuthBrokerProvider[] {
  return Object.entries(config.providers).map(([id, app]) => {
    const factory = deps.providers[id];
    if (!factory) {
      throw new Error(`oauth-broker: no adapter for provider "${id}"`);
    }
    const provider = factory(app);
    if (provider.id !== id) {
      throw new Error(
        `oauth-broker: adapter for "${id}" reports provider "${provider.id}"`,
      );
    }
    return provider;
  });
}

/**
 * The managed OAuth broker: one central brain holds each provider's app
 * secret and its single callback, and hands instance brains a one-time grant
 * they redeem for the credential. Pending state lives in memory only.
 */
export function createOAuthBrokerPackage(
  deps: OAuthBrokerDeps,
): ServicePackageDefinition<typeof oauthBrokerConfigSchema> {
  const service = defineServicePlugin({
    id: "oauth-broker",
    config: oauthBrokerConfigSchema,
    setup: (context): OAuthBrokerState => {
      const { config } = context;
      const providers = providersOf(config, deps);
      if (config.instances.length === 0 || providers.length === 0) {
        return { routes: [] };
      }
      // Built once, so the routes share one instance registry and start limit.
      return {
        routes: createBrokerRoutes({
          publicUrl: config.publicUrl,
          providers,
          instances: new BrokerInstances(config.instances),
          authorizations: new SingleUseStore<PendingAuthorization>({
            ttlMs: AUTHORIZATION_TTL_MS,
            maxPending: MAX_PENDING,
            now: deps.now,
          }),
          grants: new SingleUseStore<PendingGrant>({
            ttlMs: GRANT_TTL_MS,
            maxPending: MAX_PENDING,
            now: deps.now,
          }),
          now: deps.now ?? Date.now,
          logger: serviceRuntime(context).logger,
        }),
      };
    },
  });
  return withWebRoutes<typeof oauthBrokerConfigSchema, OAuthBrokerState>(
    service,
    ({ state }) => state.routes,
  );
}
