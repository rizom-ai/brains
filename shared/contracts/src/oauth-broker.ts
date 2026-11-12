import { z } from "@brains/utils/zod";
import { jsonObjectSchema, type JsonObject } from "./json";

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

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

export const oauthBrokerAuthorizationRequestSchema: Strict<{
  provider: z.ZodString;
  brainState: z.ZodString;
}> = z.strictObject({
  provider: oauthBrokerProviderIdSchema,
  /** The instance's own single-use state, handed back on return. */
  brainState: tokenSchema,
});

export type OAuthBrokerAuthorizationRequest = z.output<
  typeof oauthBrokerAuthorizationRequestSchema
>;

export const oauthBrokerAuthorizationResponseSchema: Strict<{
  authorizationUrl: z.ZodURL;
}> = z.strictObject({ authorizationUrl: z.url({ protocol: /^https?$/ }) });

export type OAuthBrokerAuthorizationResponse = z.output<
  typeof oauthBrokerAuthorizationResponseSchema
>;

export const oauthBrokerGrantRedemptionRequestSchema: Strict<{
  provider: z.ZodString;
  grant: z.ZodString;
}> = z.strictObject({
  provider: oauthBrokerProviderIdSchema,
  grant: tokenSchema,
});

export type OAuthBrokerGrantRedemptionRequest = z.output<
  typeof oauthBrokerGrantRedemptionRequestSchema
>;

export const oauthBrokerGrantRedemptionResponseSchema: Strict<{
  provider: z.ZodString;
  credential: typeof jsonObjectSchema;
}> = z.strictObject({
  provider: oauthBrokerProviderIdSchema,
  /** Opaque to the broker; its provider adapter and the instance read it. */
  credential: jsonObjectSchema,
});

export type OAuthBrokerGrantRedemptionResponse = z.output<
  typeof oauthBrokerGrantRedemptionResponseSchema
>;

const oauthBrokerReturnErrorSchema: z.ZodEnum<{
  provider_denied: "provider_denied";
  authorization_incomplete: "authorization_incomplete";
  credential_exchange_failed: "credential_exchange_failed";
}> = z.enum([
  "provider_denied",
  "authorization_incomplete",
  "credential_exchange_failed",
]);

export type OAuthBrokerReturnError = z.output<
  typeof oauthBrokerReturnErrorSchema
>;

/** The query the broker sends the browser back to the instance with. */
export const oauthBrokerReturnSchema: z.ZodUnion<
  [
    Strict<{ provider: z.ZodString; state: z.ZodString; grant: z.ZodString }>,
    Strict<{
      provider: z.ZodString;
      state: z.ZodString;
      error: typeof oauthBrokerReturnErrorSchema;
    }>,
  ]
> = z.union([
  z.strictObject({
    provider: oauthBrokerProviderIdSchema,
    state: tokenSchema,
    grant: tokenSchema,
  }),
  z.strictObject({
    provider: oauthBrokerProviderIdSchema,
    state: tokenSchema,
    error: oauthBrokerReturnErrorSchema,
  }),
]);

export type OAuthBrokerReturn = z.output<typeof oauthBrokerReturnSchema>;

/**
 * One provider's OAuth semantics, composed into the broker: its consent URL,
 * scopes and code exchange. The broker core never reads the credential.
 */
export interface OAuthBrokerProvider {
  readonly id: string;
  authorizationUrl(input: { redirectUri: string; state: string }): URL;
  exchange(input: { code: string; redirectUri: string }): Promise<JsonObject>;
}
