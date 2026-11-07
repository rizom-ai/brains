import { z } from "@brains/utils/zod";
import { jsonObjectSchema, type JsonObject } from "./json";

/**
 * The managed OAuth broker's protocol. One central brain holds a provider's
 * app secret and its single registered callback; each instance brain starts
 * a connection there, gets the browser back with a one-time grant, and
 * redeems that grant server to server for the provider's credential.
 */
export const OAUTH_BROKER_PATHS: {
  readonly authorizations: "/oauth-broker/authorizations";
  readonly redeem: "/oauth-broker/grants/redeem";
} = {
  authorizations: "/oauth-broker/authorizations",
  redeem: "/oauth-broker/grants/redeem",
};

/** The provider's one registered callback on the broker. */
export function oauthBrokerCallbackPath(provider: string): string {
  return `/oauth-broker/callback/${provider}`;
}

export const oauthBrokerProviderIdSchema: z.ZodString = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/);

const tokenSchema: z.ZodString = z.string().min(32).max(512);

export interface OAuthBrokerAuthorizationRequest {
  provider: string;
  /** The instance's own single-use state, handed back on return. */
  brainState: string;
}

export const oauthBrokerAuthorizationRequestSchema: z.ZodType<OAuthBrokerAuthorizationRequest> =
  z.strictObject({
    provider: oauthBrokerProviderIdSchema,
    brainState: tokenSchema,
  });

export interface OAuthBrokerAuthorizationResponse {
  authorizationUrl: string;
}

export const oauthBrokerAuthorizationResponseSchema: z.ZodType<OAuthBrokerAuthorizationResponse> =
  z.strictObject({ authorizationUrl: z.url({ protocol: /^https?$/ }) });

export interface OAuthBrokerGrantRedemptionRequest {
  provider: string;
  grant: string;
}

export const oauthBrokerGrantRedemptionRequestSchema: z.ZodType<OAuthBrokerGrantRedemptionRequest> =
  z.strictObject({ provider: oauthBrokerProviderIdSchema, grant: tokenSchema });

export interface OAuthBrokerGrantRedemptionResponse {
  provider: string;
  /** Opaque to the broker; its provider adapter and the instance read it. */
  credential: JsonObject;
}

export const oauthBrokerGrantRedemptionResponseSchema: z.ZodType<OAuthBrokerGrantRedemptionResponse> =
  z.strictObject({
    provider: oauthBrokerProviderIdSchema,
    credential: jsonObjectSchema,
  });

export type OAuthBrokerReturnError =
  "provider_denied" | "authorization_incomplete" | "credential_exchange_failed";

/** The query the broker sends the browser back to the instance with. */
export type OAuthBrokerReturn =
  | { provider: string; state: string; grant: string }
  | { provider: string; state: string; error: OAuthBrokerReturnError };

export const oauthBrokerReturnSchema: z.ZodType<OAuthBrokerReturn> = z.union([
  z.strictObject({
    provider: oauthBrokerProviderIdSchema,
    state: tokenSchema,
    grant: tokenSchema,
  }),
  z.strictObject({
    provider: oauthBrokerProviderIdSchema,
    state: tokenSchema,
    error: z.enum([
      "provider_denied",
      "authorization_incomplete",
      "credential_exchange_failed",
    ]),
  }),
]);

/**
 * One provider's OAuth semantics, composed into the broker: its consent URL,
 * scopes and code exchange. The broker core never reads the credential.
 */
export interface OAuthBrokerProvider {
  readonly id: string;
  authorizationUrl(input: { redirectUri: string; state: string }): URL;
  exchange(input: { code: string; redirectUri: string }): Promise<JsonObject>;
}
