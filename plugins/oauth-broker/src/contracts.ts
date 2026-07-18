import { z } from "@brains/utils/zod";

export type OAuthBrokerJsonPrimitive = string | number | boolean | null;
export type OAuthBrokerJsonValue =
  | OAuthBrokerJsonPrimitive
  | OAuthBrokerJsonValue[]
  | { [key: string]: OAuthBrokerJsonValue };
export type OAuthBrokerCredential = Record<string, OAuthBrokerJsonValue>;

const oauthBrokerJsonValueSchema: z.ZodType<OAuthBrokerJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(oauthBrokerJsonValueSchema),
    z.record(z.string(), oauthBrokerJsonValueSchema),
  ]),
);

export const oauthBrokerCredentialSchema: z.ZodType<OAuthBrokerCredential> =
  z.record(z.string(), oauthBrokerJsonValueSchema);

export const oauthBrokerProviderIdSchema: z.ZodType<string> = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/);

export interface OAuthBrokerAuthorizationRequest {
  provider: string;
  brainState: string;
}

export const oauthBrokerAuthorizationRequestSchema: z.ZodType<OAuthBrokerAuthorizationRequest> =
  z
    .object({
      provider: oauthBrokerProviderIdSchema,
      brainState: z.string().min(16).max(512),
    })
    .strict();

export interface OAuthBrokerGrantRedemptionRequest {
  provider: string;
  grant: string;
}

export const oauthBrokerGrantRedemptionRequestSchema: z.ZodType<OAuthBrokerGrantRedemptionRequest> =
  z
    .object({
      provider: oauthBrokerProviderIdSchema,
      grant: z.string().min(32).max(512),
    })
    .strict();

export interface OAuthBrokerAuthorizationResponse {
  authorizationUrl: string;
}

export interface OAuthBrokerGrantRedemptionResponse {
  provider: string;
  credential: OAuthBrokerCredential;
}

export interface OAuthBrokerProvider {
  readonly id: string;
  createAuthorizationUrl(request: { redirectUri: string; state: string }): URL;
  exchangeCode(request: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthBrokerCredential>;
}
