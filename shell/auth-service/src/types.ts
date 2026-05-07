export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface PublicJwk extends JsonObject {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  use: "sig";
  alg: "ES256";
}

export interface PrivateJwk extends PublicJwk {
  d: string;
}

export interface JwksResponse extends JsonObject {
  keys: PublicJwk[];
}

export interface AuthorizationServerMetadata extends JsonObject {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
}

export interface ProtectedResourceMetadata extends JsonObject {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  resource_signing_alg_values_supported: string[];
}

export interface RegisteredOAuthClient {
  client_id: string;
  client_id_issued_at: number;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
  scope?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  contacts?: string[];
  client_secret?: string;
  client_secret_expires_at?: number;
}
