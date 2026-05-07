const DEFAULT_DEV_ISSUER = "http://localhost:8080";

export function normalizeIssuer(issuer?: string): string {
  const trimmed = issuer?.trim();
  if (!trimmed) return DEFAULT_DEV_ISSUER;

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  const parsed = new URL(withoutTrailingSlash);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(
      "OAuth issuer must be an origin without path, query, or hash",
    );
  }

  return parsed.origin;
}

export function issuerFromRequest(
  request: Request,
  fallbackIssuer?: string,
): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim();
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (host) {
    const scheme = proto ?? new URL(request.url).protocol.replace(":", "");
    return normalizeIssuer(`${scheme}://${host}`);
  }

  return normalizeIssuer(fallbackIssuer ?? new URL(request.url).origin);
}

export function absoluteUrl(issuer: string, path: string): string {
  return `${normalizeIssuer(issuer)}${path.startsWith("/") ? path : `/${path}`}`;
}
