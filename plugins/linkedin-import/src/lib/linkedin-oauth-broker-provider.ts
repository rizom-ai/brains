import type {
  OAuthBrokerCredential,
  OAuthBrokerProvider,
} from "@brains/oauth-broker";
import type {
  LinkedInAuthorizationRequest,
  LinkedInCodeExchangeRequest,
  LinkedInOAuthClient,
} from "./linkedin-oauth-client";

export const LINKEDIN_OAUTH_BROKER_PROVIDER_ID = "linkedin";

/** LinkedIn-specific OAuth semantics injected into the provider-neutral broker. */
export class LinkedInOAuthBrokerProvider implements OAuthBrokerProvider {
  readonly id: typeof LINKEDIN_OAUTH_BROKER_PROVIDER_ID =
    LINKEDIN_OAUTH_BROKER_PROVIDER_ID;
  private readonly client: LinkedInOAuthClient;

  constructor(client: LinkedInOAuthClient) {
    this.client = client;
  }

  createAuthorizationUrl(request: LinkedInAuthorizationRequest): URL {
    return this.client.createAuthorizationUrl(request);
  }

  async exchangeCode(
    request: LinkedInCodeExchangeRequest,
  ): Promise<OAuthBrokerCredential> {
    const token = await this.client.exchangeCode(request);
    return {
      accessToken: token.accessToken,
      expiresIn: token.expiresIn,
      ...(token.scope ? { scope: token.scope } : {}),
      ...(token.tokenType ? { tokenType: token.tokenType } : {}),
    };
  }
}
