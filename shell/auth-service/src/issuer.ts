import {
  isLoopbackIssuer,
  issuerFromRequest,
  normalizeIssuer,
} from "@brains/plugins";
import type { WebAuthnRequestContext } from "./passkey-service";

// The browser auth-session cookie may only carry `Secure` over HTTPS. Passkeys and
// OAuth both require a secure context outside loopback, so any non-loopback
// request is HTTPS and must get `Secure`; loopback dev over plain HTTP must not.
export function isSecureRequest(request: Request): boolean {
  return !isLoopbackIssuer(issuerFromRequest(request));
}

/** The WebAuthn origin and relying party ID for the issuer a request reached. */
export function webAuthnRequestContext(
  request: Request,
): WebAuthnRequestContext {
  const issuer = new URL(issuerFromRequest(request));
  return { origin: issuer.origin, rpID: issuer.hostname };
}

export function absoluteUrl(issuer: string, path: string): string {
  return `${normalizeIssuer(issuer)}${path.startsWith("/") ? path : `/${path}`}`;
}
