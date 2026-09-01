export type {
  AuthBearerGrant,
  AuthAudit,
  AuthCaller,
  AuthPrincipal,
  VerifiedAccessToken,
} from "@brains/plugins";
import type { A2APrivateJwk } from "./types";
import type { A2APeerTrustRecord } from "./peer-trust-store";

/** The key this brain signs A2A requests with, and its published id. */
export interface A2ASigningKey {
  privateJwk: A2APrivateJwk;
  keyId: string;
}

/**
 * What this deployment is to its peers.
 *
 * Federation asks three things of auth: the issuer this brain speaks as, the
 * trust it has recorded for a peer domain, and the key it signs with. The
 * pure issuer helpers (`isLoopbackIssuer`, `issuerFromRequest`) stay free
 * functions beside this — they need no service.
 *
 * Named consumer: @brains/a2a.
 */
export interface AuthFederation {
  getIssuer(): string;
  getA2APeerTrust(domain: string): Promise<A2APeerTrustRecord | undefined>;
  getA2ASigningKey(): Promise<A2ASigningKey>;
}
