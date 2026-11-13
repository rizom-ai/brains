import {
  OAUTH_BROKER_PATHS,
  oauthBrokerAuthorizationRequestSchema,
  oauthBrokerCallbackPath,
  oauthBrokerGrantRedemptionRequestSchema,
  type OAuthBrokerAuthorizationResponse,
  type OAuthBrokerGrantRedemptionResponse,
  type OAuthBrokerProvider,
  type OAuthBrokerReturnError,
} from "@brains/contracts";
import type { JsonObject } from "@brains/contracts";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { SingleUseStore } from "@brains/utils/single-use-store";
import type { BrokerInstances } from "./instances";

export interface PendingAuthorization {
  provider: string;
  instanceId: string;
  returnUri: string;
  brainState: string;
}

export interface PendingGrant {
  provider: string;
  instanceId: string;
  credential: JsonObject;
}

export interface BrokerRouteDeps {
  publicUrl: string;
  providers: readonly OAuthBrokerProvider[];
  instances: BrokerInstances;
  authorizations: SingleUseStore<PendingAuthorization>;
  grants: SingleUseStore<PendingGrant>;
  now: () => number;
  logger: Logger;
}

const STARTS_PER_WINDOW = 10;
const START_WINDOW_MS = 10 * 60 * 1000;

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: PRIVATE_HEADERS });
}

function unauthorized(): Response {
  return Response.json(
    { error: "Broker instance authentication required" },
    {
      status: 401,
      headers: {
        ...PRIVATE_HEADERS,
        "WWW-Authenticate": 'Basic realm="oauth-broker"',
      },
    },
  );
}

async function body(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return undefined;
  }
  try {
    return await request.json();
  } catch {
    // A malformed body reads as missing; the schema then refuses it.
    return undefined;
  }
}

function backToInstance(
  pending: PendingAuthorization,
  outcome: { grant: string } | { error: OAuthBrokerReturnError },
): Response {
  const url = new URL(pending.returnUri);
  url.searchParams.set("provider", pending.provider);
  url.searchParams.set("state", pending.brainState);
  Object.entries(outcome).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return new Response(null, {
    status: 303,
    headers: { ...PRIVATE_HEADERS, Location: url.toString() },
  });
}

/**
 * The broker's routes on the shared host. Instances authenticate with HTTP
 * Basic; the provider callback is guarded by the broker's single-use state.
 * Credentials leave the broker only in a grant redemption response.
 */
export function createBrokerRoutes(
  deps: BrokerRouteDeps,
): WebRouteDefinition[] {
  const providers = new Map(
    deps.providers.map((provider) => [provider.id, provider]),
  );
  // Connections each instance started recently, so one instance cannot
  // crowd the shared pending store and evict another's.
  const starts = new Map<string, number[]>();
  const admitStart = (instanceId: string): boolean => {
    const now = deps.now();
    const recent = (starts.get(instanceId) ?? []).filter(
      (startedAt) => startedAt > now - START_WINDOW_MS,
    );
    const admitted = recent.length < STARTS_PER_WINDOW;
    starts.set(instanceId, admitted ? [...recent, now] : recent);
    return admitted;
  };
  const callbackUri = (provider: string): string =>
    new URL(oauthBrokerCallbackPath(provider), deps.publicUrl).toString();

  const authorize = async (request: Request): Promise<Response> => {
    const instance = deps.instances.authenticate(request);
    if (!instance) return unauthorized();
    const parsed = oauthBrokerAuthorizationRequestSchema.safeParse(
      await body(request),
    );
    if (!parsed.success) {
      return json({ error: "Invalid authorization request" }, 400);
    }
    const provider = providers.get(parsed.data.provider);
    const returnUri = instance.returnUris[parsed.data.provider];
    if (!provider || !returnUri) {
      return json({ error: "Provider is unavailable for this instance" }, 400);
    }
    if (!admitStart(instance.id)) {
      return json({ error: "Too many connections started; try later" }, 429);
    }
    const state = deps.authorizations.issue({
      provider: provider.id,
      instanceId: instance.id,
      returnUri,
      brainState: parsed.data.brainState,
    });
    const authorizationUrl = provider
      .authorizationUrl({ redirectUri: callbackUri(provider.id), state })
      .toString();
    return json({
      authorizationUrl,
    } satisfies OAuthBrokerAuthorizationResponse);
  };

  const redeem = async (request: Request): Promise<Response> => {
    const instance = deps.instances.authenticate(request);
    if (!instance) return unauthorized();
    const parsed = oauthBrokerGrantRedemptionRequestSchema.safeParse(
      await body(request),
    );
    if (!parsed.success) {
      return json({ error: "Invalid grant redemption request" }, 400);
    }
    const { provider } = parsed.data;
    const pending = deps.grants.take(
      parsed.data.grant,
      (grant) =>
        grant.provider === provider && grant.instanceId === instance.id,
    );
    if (!pending) return json({ error: "Invalid or expired grant" }, 400);
    return json({
      provider,
      credential: pending.credential,
    } satisfies OAuthBrokerGrantRedemptionResponse);
  };

  const callback =
    (provider: OAuthBrokerProvider) =>
    async (request: Request): Promise<Response> => {
      const params = new URL(request.url).searchParams;
      const pending = deps.authorizations.take(
        params.get("state") ?? "",
        (authorization) => authorization.provider === provider.id,
      );
      if (!pending) {
        return json({ error: "Invalid, expired or used authorization" }, 400);
      }
      if (params.has("error")) {
        return backToInstance(pending, { error: "provider_denied" });
      }
      const code = params.get("code")?.trim();
      if (!code) {
        return backToInstance(pending, { error: "authorization_incomplete" });
      }
      try {
        const credential = await provider.exchange({
          code,
          redirectUri: callbackUri(provider.id),
        });
        const grant = deps.grants.issue({
          provider: provider.id,
          instanceId: pending.instanceId,
          credential,
        });
        return backToInstance(pending, { grant });
      } catch (error) {
        deps.logger.warn(
          `OAuth broker exchange for ${provider.id} failed: ${getErrorMessage(error)}`,
        );
        return backToInstance(pending, { error: "credential_exchange_failed" });
      }
    };

  return [
    {
      path: OAUTH_BROKER_PATHS.authorizations,
      method: "POST",
      public: true,
      handler: authorize,
    },
    {
      path: OAUTH_BROKER_PATHS.redeem,
      method: "POST",
      public: true,
      handler: redeem,
    },
    ...deps.providers.map((provider): WebRouteDefinition => ({
      path: oauthBrokerCallbackPath(provider.id),
      method: "GET",
      public: true,
      handler: callback(provider),
    })),
  ];
}
