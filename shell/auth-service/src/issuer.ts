import {
  isLoopbackIssuer,
  issuerFromRequest,
  normalizeIssuer,
} from "@brains/plugins";

// The browser auth-session cookie may only carry `Secure` over HTTPS. Passkeys and
// OAuth both require a secure context outside loopback, so any non-loopback
// request is HTTPS and must get `Secure`; loopback dev over plain HTTP must not.
export function isSecureRequest(request: Request): boolean {
  return !isLoopbackIssuer(issuerFromRequest(request));
}

export function absoluteUrl(issuer: string, path: string): string {
  return `${normalizeIssuer(issuer)}${path.startsWith("/") ? path : `/${path}`}`;
}
