import {
  oauthBrokerProviderIdSchema,
  type OAuthBrokerProvider,
} from "@brains/contracts";
import {
  ServicePlugin,
  type ServicePluginContext,
  type WebRouteDefinition,
} from "@brains/plugins";
import { SingleUseStore } from "@brains/utils/single-use-store";
import { z } from "@brains/utils/zod";
import { BrokerInstances } from "./instances";
import {
  createBrokerRoutes,
  type PendingAuthorization,
  type PendingGrant,
} from "./routes";
import packageJson from "../package.json";

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

const oauthBrokerConfigSchema: z.ZodObject<{
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
/** Brains pass raw config records; the schema validates them at parse time. */
type OAuthBrokerConfigInput = Record<string, unknown>;

/** Builds a provider's adapter from the shared app the broker holds for it. */
export type ProviderFactory = (app: ProviderAppConfig) => OAuthBrokerProvider;

export interface OAuthBrokerDeps {
  providers: Readonly<Record<string, ProviderFactory>>;
  now?: () => number;
}

/**
 * The managed OAuth broker: one central brain holds each provider's app
 * secret and its single callback, and hands instance brains a one-time grant
 * they redeem for the credential. Pending state lives in memory only.
 */
export class OAuthBrokerPlugin extends ServicePlugin<
  OAuthBrokerConfig,
  OAuthBrokerConfigInput
> {
  private readonly deps: OAuthBrokerDeps;
  /** Built once, so the routes share one instance registry and start limit. */
  private routes: WebRouteDefinition[] = [];
  private readonly authorizations: SingleUseStore<PendingAuthorization>;
  private readonly grants: SingleUseStore<PendingGrant>;

  constructor(config: OAuthBrokerConfigInput, deps: OAuthBrokerDeps) {
    super("oauth-broker", packageJson, config, oauthBrokerConfigSchema);
    this.deps = deps;
    this.authorizations = new SingleUseStore({
      ttlMs: AUTHORIZATION_TTL_MS,
      maxPending: MAX_PENDING,
      now: deps.now,
    });
    this.grants = new SingleUseStore({
      ttlMs: GRANT_TTL_MS,
      maxPending: MAX_PENDING,
      now: deps.now,
    });
  }

  protected override async onRegister(
    _context: ServicePluginContext,
  ): Promise<void> {
    const providers = Object.entries(this.config.providers).map(([id, app]) => {
      const factory = this.deps.providers[id];
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
    if (this.config.instances.length === 0 || providers.length === 0) return;
    this.routes = createBrokerRoutes({
      publicUrl: this.config.publicUrl,
      providers,
      instances: new BrokerInstances(this.config.instances),
      authorizations: this.authorizations,
      grants: this.grants,
      now: this.deps.now ?? Date.now,
      logger: this.logger,
    });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.routes;
  }
}

export function oauthBrokerPlugin(
  config: OAuthBrokerConfigInput,
  deps: OAuthBrokerDeps,
): OAuthBrokerPlugin {
  return new OAuthBrokerPlugin(config, deps);
}
