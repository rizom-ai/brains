import { z } from "@brains/utils/zod-v4";
import type { RegisteredOAuthClient } from "./types";

const jsonRequestBodySchema = z.record(z.string(), z.unknown());

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const CORS_MACHINE_ENDPOINTS = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/jwks.json",
  "/.well-known/oauth-protected-resource",
  "/register",
  "/token",
  "/revoke",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
  "Access-Control-Allow-Private-Network": "true",
  "X-Content-Type-Options": "nosniff",
} as const;

export function isCorsMachineEndpoint(path: string): boolean {
  return CORS_MACHINE_ENDPOINTS.has(path);
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsPreflightResponse(): Response {
  return withCors(new Response(null, { status: 204 }));
}

export function oauthErrorResponse(
  error: string,
  description: string,
): Response {
  return jsonResponse(
    {
      error,
      error_description: description,
    },
    400,
  );
}

export async function parseRequestBody(
  request: Request,
): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = jsonRequestBodySchema.parse(await request.json());
    return new URLSearchParams(
      Object.entries(body).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : [],
      ),
    );
  }

  if (contentType.includes("form")) {
    return new URLSearchParams(stringEntries(await request.formData()));
  }

  return new URLSearchParams(await request.text());
}

export function stringEntries(form: FormData): [string, string][] {
  return Array.from(form.entries()).flatMap(([key, value]) =>
    typeof value === "string" ? [[key, value]] : [],
  );
}

export function validateClientForTokenRequest(
  client: RegisteredOAuthClient | undefined,
  clientAuth: { clientSecret?: string },
): string | undefined {
  if (!client) return "Unknown client_id";
  if (
    client.client_secret &&
    client.client_secret !== clientAuth.clientSecret
  ) {
    return "Invalid client secret";
  }
  return undefined;
}

export function parseClientAuth(
  request: Request,
  body: URLSearchParams,
): { clientId?: string; clientSecret?: string; error?: string } {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    const clientId = body.get("client_id") ?? undefined;
    const clientSecret = body.get("client_secret") ?? undefined;
    return {
      ...(clientId ? { clientId } : {}),
      ...(clientSecret ? { clientSecret } : {}),
    };
  }

  if (!authHeader.startsWith("Basic ")) {
    return { error: "Unsupported client authentication method" };
  }

  try {
    const decoded = Buffer.from(
      authHeader.slice("Basic ".length),
      "base64",
    ).toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return { error: "Invalid Basic client authentication" };
    }

    const clientId = decodeURIComponent(decoded.slice(0, separator));
    const clientSecret = decodeURIComponent(decoded.slice(separator + 1));
    const bodyClientId = body.get("client_id");
    if (bodyClientId && bodyClientId !== clientId) {
      return { error: "Conflicting client_id values" };
    }
    return { clientId, clientSecret };
  } catch {
    return { error: "Invalid Basic client authentication" };
  }
}

export function safeRelativeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
