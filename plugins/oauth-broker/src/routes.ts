import type { WebRouteDefinition } from "@brains/plugins";
import {
  oauthBrokerAuthorizationRequestSchema,
  oauthBrokerCredentialSchema,
  oauthBrokerGrantRedemptionRequestSchema,
  type OAuthBrokerAuthorizationResponse,
  type OAuthBrokerGrantRedemptionResponse,
  type OAuthBrokerProvider,
} from "./contracts";
import type {
  OAuthBrokerAuthorizationStateStore,
  OAuthBrokerGrantStore,
} from "./ephemeral-stores";
import type { OAuthBrokerInstanceRegistry } from "./instance-registry";

export const OAUTH_BROKER_AUTHORIZATIONS_PATH = "/oauth-broker/authorizations";
export const OAUTH_BROKER_GRANT_REDEMPTION_PATH = "/oauth-broker/grants/redeem";
export const OAUTH_BROKER_CALLBACK_PREFIX = "/oauth-broker/callback";

export function oauthBrokerCallbackPath(providerId: string): string {
  return `${OAUTH_BROKER_CALLBACK_PREFIX}/${providerId}`;
}

export interface OAuthBrokerRouteOptions {
  publicBaseUrl: string;
  providers: readonly OAuthBrokerProvider[];
  instances: OAuthBrokerInstanceRegistry;
  authorizationStates: OAuthBrokerAuthorizationStateStore;
  grants: OAuthBrokerGrantStore;
  reportError?: ((message: string) => void) | undefined;
}

const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function privateJson(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...privateHeaders, ...extraHeaders },
  });
}

function unauthorized(): Response {
  return privateJson(
    { error: "Broker instance authentication required" },
    401,
    { "WWW-Authenticate": 'Basic realm="oauth-broker"' },
  );
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return undefined;
  }
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function redirectToInstance(
  returnUri: string,
  query: Record<string, string>,
): Response {
  const url = new URL(returnUri);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return new Response(null, {
    status: 303,
    headers: { ...privateHeaders, Location: url.toString() },
  });
}

/** Exact provider routes on the shared host; authentication remains protocol-owned. */
export function createOAuthBrokerRoutes(
  options: OAuthBrokerRouteOptions,
): WebRouteDefinition[] {
  const providers = new Map(
    options.providers.map((provider) => [provider.id, provider]),
  );
  const callbackUri = (providerId: string): string =>
    new URL(
      oauthBrokerCallbackPath(providerId),
      options.publicBaseUrl,
    ).toString();
  const reportError = (message: string): void => {
    options.reportError?.(message);
  };

  const routes: WebRouteDefinition[] = [
    {
      path: OAUTH_BROKER_AUTHORIZATIONS_PATH,
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const instance = await options.instances.authenticate(request);
        if (!instance) return unauthorized();

        const parsed = oauthBrokerAuthorizationRequestSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          return privateJson({ error: "Invalid authorization request" }, 400);
        }

        const provider = providers.get(parsed.data.provider);
        const returnUri = instance.returnUris[parsed.data.provider];
        if (!provider || !returnUri) {
          return privateJson(
            { error: "Provider is unavailable for this instance" },
            400,
          );
        }

        try {
          const state = options.authorizationStates.issue({
            providerId: provider.id,
            instanceId: instance.id,
            returnUri,
            brainState: parsed.data.brainState,
          });
          const authorizationUrl = provider.createAuthorizationUrl({
            redirectUri: callbackUri(provider.id),
            state,
          });
          return privateJson({
            authorizationUrl: authorizationUrl.toString(),
          } satisfies OAuthBrokerAuthorizationResponse);
        } catch {
          reportError("OAuth broker authorization start failed");
          return privateJson({ error: "Authorization unavailable" }, 502);
        }
      },
    },
    {
      path: OAUTH_BROKER_GRANT_REDEMPTION_PATH,
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const instance = await options.instances.authenticate(request);
        if (!instance) return unauthorized();

        const parsed = oauthBrokerGrantRedemptionRequestSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          return privateJson(
            { error: "Invalid grant redemption request" },
            400,
          );
        }
        const credential = options.grants.redeem(
          parsed.data.grant,
          parsed.data.provider,
          instance.id,
        );
        if (!credential) {
          return privateJson({ error: "Invalid or expired grant" }, 400);
        }
        return privateJson({
          provider: parsed.data.provider,
          credential,
        } satisfies OAuthBrokerGrantRedemptionResponse);
      },
    },
  ];

  for (const provider of options.providers) {
    routes.push({
      path: oauthBrokerCallbackPath(provider.id),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const callback = new URL(request.url);
        const state = callback.searchParams.get("state") ?? "";
        const pending = options.authorizationStates.consume(state, provider.id);
        if (!pending) {
          return privateJson(
            { error: "Invalid, expired, or already used authorization state" },
            400,
          );
        }

        if (callback.searchParams.has("error")) {
          return redirectToInstance(pending.returnUri, {
            provider: provider.id,
            state: pending.brainState,
            error: "provider_denied",
          });
        }

        const code = callback.searchParams.get("code")?.trim();
        if (!code) {
          return redirectToInstance(pending.returnUri, {
            provider: provider.id,
            state: pending.brainState,
            error: "authorization_incomplete",
          });
        }

        try {
          const credential = oauthBrokerCredentialSchema.parse(
            await provider.exchangeCode({
              code,
              redirectUri: callbackUri(provider.id),
            }),
          );
          const grant = options.grants.issue({
            providerId: provider.id,
            instanceId: pending.instanceId,
            credential,
          });
          return redirectToInstance(pending.returnUri, {
            provider: provider.id,
            state: pending.brainState,
            grant,
          });
        } catch {
          reportError("OAuth broker provider callback failed");
          return redirectToInstance(pending.returnUri, {
            provider: provider.id,
            state: pending.brainState,
            error: "credential_exchange_failed",
          });
        }
      },
    });
  }

  return routes;
}
