import type { WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json" with { type: "json" };
import {
  oauthBrokerProviderIdSchema,
  type OAuthBrokerProvider,
} from "./contracts";
import {
  OAuthBrokerAuthorizationStateStore,
  OAuthBrokerGrantStore,
} from "./ephemeral-stores";
import {
  StaticOAuthBrokerInstanceRegistry,
  type OAuthBrokerInstanceConfig,
  type OAuthBrokerInstanceRegistry,
} from "./instance-registry";
import { createOAuthBrokerRoutes } from "./routes";

export interface OAuthBrokerConfig {
  publicBaseUrl: string;
  instances: OAuthBrokerInstanceConfig[];
  authorizationStateTtlMs: number;
  grantTtlMs: number;
  maxPendingAuthorizations: number;
  maxPendingGrants: number;
}

export interface OAuthBrokerConfigInput {
  publicBaseUrl: string;
  instances?: OAuthBrokerInstanceConfig[] | undefined;
  authorizationStateTtlMs?: number | undefined;
  grantTtlMs?: number | undefined;
  maxPendingAuthorizations?: number | undefined;
  maxPendingGrants?: number | undefined;
}

const positiveInteger = z.number().int().positive();
const instanceConfigSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
    clientSecret: z.string().min(32),
    returnUris: z.record(oauthBrokerProviderIdSchema, z.url()),
  })
  .strict();

const oauthBrokerConfigSchema: z.ZodType<
  OAuthBrokerConfig,
  OAuthBrokerConfigInput
> = z
  .object({
    publicBaseUrl: z.url(),
    instances: z.array(instanceConfigSchema).default([]),
    authorizationStateTtlMs: positiveInteger.default(10 * 60 * 1000),
    grantTtlMs: positiveInteger.default(2 * 60 * 1000),
    maxPendingAuthorizations: positiveInteger.default(1_000),
    maxPendingGrants: positiveInteger.default(1_000),
  })
  .superRefine((config, context) => {
    const ids = config.instances.map((instance) => instance.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "OAuth broker instance ids must be unique",
      });
    }
  });

export interface OAuthBrokerDeps {
  providers: readonly OAuthBrokerProvider[];
  instanceRegistry?: OAuthBrokerInstanceRegistry | undefined;
  authorizationStates?: OAuthBrokerAuthorizationStateStore | undefined;
  grants?: OAuthBrokerGrantStore | undefined;
}

function isLoopback(url: URL): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function validatedBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopback(url))
  ) {
    throw new Error("OAuth broker public URL must use HTTPS outside loopback");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("OAuth broker public URL must contain only an origin");
  }
  return url.toString();
}

function validateReturnUri(value: string): void {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopback(url))
  ) {
    throw new Error("OAuth broker return URIs must use HTTPS outside loopback");
  }
  if (url.search || url.hash) {
    throw new Error("OAuth broker return URIs must not contain query or hash");
  }
}

export class OAuthBrokerPlugin extends ServicePlugin<
  OAuthBrokerConfig,
  OAuthBrokerConfigInput
> {
  private readonly deps: OAuthBrokerDeps;
  private readonly publicBaseUrl: string;
  private readonly instanceRegistry: OAuthBrokerInstanceRegistry;
  private readonly authorizationStates: OAuthBrokerAuthorizationStateStore;
  private readonly grants: OAuthBrokerGrantStore;
  private routes: WebRouteDefinition[] | undefined;

  constructor(config: OAuthBrokerConfigInput, deps: OAuthBrokerDeps) {
    super("oauth-broker", packageJson, config, oauthBrokerConfigSchema);
    this.deps = deps;
    this.publicBaseUrl = validatedBaseUrl(this.config.publicBaseUrl);

    const providerIds = deps.providers.map((provider) => provider.id);
    if (providerIds.length === 0) {
      throw new Error("OAuth broker requires at least one provider adapter");
    }
    if (new Set(providerIds).size !== providerIds.length) {
      throw new Error("OAuth broker provider ids must be unique");
    }
    for (const providerId of providerIds) {
      oauthBrokerProviderIdSchema.parse(providerId);
    }
    for (const instance of this.config.instances) {
      for (const returnUri of Object.values(instance.returnUris)) {
        validateReturnUri(returnUri);
      }
    }

    this.instanceRegistry =
      deps.instanceRegistry ??
      new StaticOAuthBrokerInstanceRegistry(this.config.instances);
    this.authorizationStates =
      deps.authorizationStates ??
      new OAuthBrokerAuthorizationStateStore({
        ttlMs: this.config.authorizationStateTtlMs,
        maxPending: this.config.maxPendingAuthorizations,
      });
    this.grants =
      deps.grants ??
      new OAuthBrokerGrantStore({
        ttlMs: this.config.grantTtlMs,
        maxPending: this.config.maxPendingGrants,
      });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    this.routes ??= createOAuthBrokerRoutes({
      publicBaseUrl: this.publicBaseUrl,
      providers: this.deps.providers,
      instances: this.instanceRegistry,
      authorizationStates: this.authorizationStates,
      grants: this.grants,
      reportError: (message): void => this.logger.error(message),
    });
    return this.routes;
  }
}

export function oauthBrokerPlugin(
  config: OAuthBrokerConfigInput,
  deps: OAuthBrokerDeps,
): OAuthBrokerPlugin {
  return new OAuthBrokerPlugin(config, deps);
}
