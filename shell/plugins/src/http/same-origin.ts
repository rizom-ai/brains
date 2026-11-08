/**
 * The brain's public origin as a request sees it, and the same-origin guards
 * browser-facing routes put in front of mutations.
 */
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

export function isLoopbackIssuer(issuer: string): boolean {
  const hostname = new URL(normalizeIssuer(issuer)).hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  );
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

function privateJsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Deployed brains sit behind a TLS-terminating proxy, so the request URL's
// scheme is the internal http hop; the browser's Origin must be compared
// against the forwarded origin instead.
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  try {
    return origin === issuerFromRequest(request);
  } catch {
    return false;
  }
}

export function requireSameOriginRequest(
  request: Request,
): Response | undefined {
  return isSameOriginRequest(request)
    ? undefined
    : privateJsonError("Same-origin request required", 403);
}

export function requireSameOriginJson(request: Request): Response | undefined {
  const originError = requireSameOriginRequest(request);
  if (originError) return originError;
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return privateJsonError("JSON request required", 415);
  }
  return undefined;
}
