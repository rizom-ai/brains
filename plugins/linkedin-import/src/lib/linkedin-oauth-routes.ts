import type { WebRouteDefinition } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { LinkedInBrokerClient } from "./linkedin-broker-client";
import {
  LINKEDIN_PORTABILITY_SCOPE,
  type LinkedInOAuthClient,
  type LinkedInOAuthTokenStore,
} from "./linkedin-oauth-client";
import { LINKEDIN_OAUTH_BROKER_PROVIDER_ID } from "./linkedin-oauth-broker-provider";
import { LinkedInOAuthStateStore } from "./linkedin-oauth-state-store";

export const LINKEDIN_ADMIN_STATUS_PATH = "/linkedin/admin/status";
export const LINKEDIN_ADMIN_CONNECT_PATH = "/linkedin/admin/connect";
export const LINKEDIN_ADMIN_DISCONNECT_PATH = "/linkedin/admin/disconnect";
export const LINKEDIN_DIRECT_CALLBACK_PATH = "/linkedin/oauth/direct/callback";
export const LINKEDIN_BROKER_RETURN_PATH = "/linkedin/oauth/broker/return";
export const LINKEDIN_ADMIN_INTEGRATIONS_URL =
  "/admin?section=integrations&provider=linkedin";

export const LINKEDIN_ADMIN_MUTATION_ACTIONS = {
  connectLinkedIn: "connectLinkedIn",
  disconnectLinkedIn: "disconnectLinkedIn",
} as const;

export type LinkedInAnchorSessionResolver = (
  request: Request,
) => Promise<boolean>;

export type LinkedInOAuthConnectionMode = "broker" | "direct";

export interface LinkedInOAuthStatusResponse {
  connected: boolean;
  connectionMode: LinkedInOAuthConnectionMode;
  requestedScope: typeof LINKEDIN_PORTABILITY_SCOPE;
  staticAccessTokenConfigured: boolean;
  expiresAt?: number | undefined;
  scope?: string | undefined;
}

export interface LinkedInAdminConnectResponse {
  authorizationUrl: string;
}

export interface LinkedInAdminDisconnectResponse {
  disconnected: true;
}

interface LinkedInOAuthRoutesBaseOptions {
  tokenStore: LinkedInOAuthTokenStore;
  stateStore?: LinkedInOAuthStateStore | undefined;
  resolveAnchorSession: LinkedInAnchorSessionResolver;
  staticAccessTokenConfigured?: boolean | undefined;
  reportError?: ((message: string) => void) | undefined;
}

export interface LinkedInDirectOAuthRoutesOptions extends LinkedInOAuthRoutesBaseOptions {
  mode?: "direct" | undefined;
  client: LinkedInOAuthClient;
  redirectUri: string;
}

export interface LinkedInBrokerOAuthRoutesOptions extends LinkedInOAuthRoutesBaseOptions {
  mode: "broker";
  brokerClient: LinkedInBrokerClient;
}

export type LinkedInOAuthRoutesOptions =
  LinkedInDirectOAuthRoutesOptions | LinkedInBrokerOAuthRoutesOptions;

const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const errorPageHeaders = {
  ...privateHeaders,
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  "Content-Type": "text/html; charset=utf-8",
};

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      ...privateHeaders,
      Location: location,
    },
  });
}

function adminReturnUrl(status: "connected"): string {
  return `${LINKEDIN_ADMIN_INTEGRATIONS_URL}&status=${status}`;
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function isLoopback(url: URL): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function errorPage(title: string, detail: string, status: number): Response {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Rover</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09101a;color:#e9edf4;font-family:Georgia,"Times New Roman",serif}.card{width:min(560px,calc(100% - 32px));padding:48px;border:1px solid #2a3546;background:#111925}small{color:#4ea1ff;font:12px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}h1{font-size:42px;font-weight:400;margin:18px 0}p{color:#aab3c1;line-height:1.65}a{display:inline-block;margin-top:18px;color:#4ea1ff;font-family:ui-monospace,monospace}</style></head><body><main class="card"><small>LinkedIn / OAuth</small><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><a href="${LINKEDIN_ADMIN_INTEGRATIONS_URL}">Return to Admin</a></main></body></html>`;
  return new Response(body, { status, headers: errorPageHeaders });
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

async function validateConfirmedAction(
  request: Request,
  action: (typeof LINKEDIN_ADMIN_MUTATION_ACTIONS)[keyof typeof LINKEDIN_ADMIN_MUTATION_ACTIONS],
): Promise<Response | undefined> {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Same-origin request required" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return privateJson({ error: "JSON request required" }, 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const parsed = z
    .strictObject({
      action: z.literal(action),
      confirmation: z.literal(action),
    })
    .safeParse(body);
  return parsed.success
    ? undefined
    : privateJson(
        { error: "Invalid or unconfirmed LinkedIn admin action" },
        400,
      );
}

function directRedirectUri(options: LinkedInDirectOAuthRoutesOptions): string {
  const redirectUri = new URL(options.redirectUri);
  if (
    redirectUri.protocol !== "https:" &&
    !(redirectUri.protocol === "http:" && isLoopback(redirectUri))
  ) {
    throw new Error(
      "Direct LinkedIn OAuth redirect URI must use HTTPS outside loopback",
    );
  }
  if (
    redirectUri.pathname !== LINKEDIN_DIRECT_CALLBACK_PATH ||
    redirectUri.search ||
    redirectUri.hash
  ) {
    throw new Error(
      `Direct LinkedIn OAuth redirect URI must end at ${LINKEDIN_DIRECT_CALLBACK_PATH}`,
    );
  }
  return redirectUri.toString();
}

function invalidStatePage(): Response {
  return errorPage(
    "Authorization expired",
    "This callback is invalid, expired, or already used. Start a new connection from Admin.",
    400,
  );
}

/** Legacy route declarations pending the normalized HTTP route registry. */
export function createLinkedInOAuthRoutes(
  options: LinkedInOAuthRoutesOptions,
): WebRouteDefinition[] {
  const connectionMode: LinkedInOAuthConnectionMode =
    options.mode === "broker" ? "broker" : "direct";
  const stateRedirectUri =
    options.mode === "broker"
      ? LINKEDIN_BROKER_RETURN_PATH
      : directRedirectUri(options);
  const stateStore = options.stateStore ?? new LinkedInOAuthStateStore();
  const reportError = (message: string): void => {
    options.reportError?.(message);
  };

  const routes: WebRouteDefinition[] = [
    {
      path: LINKEDIN_ADMIN_STATUS_PATH,
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        if (!(await options.resolveAnchorSession(request))) {
          return privateJson({ error: "Anchor session required" }, 403);
        }
        try {
          const status = await options.tokenStore.getStatus();
          const response: LinkedInOAuthStatusResponse = {
            connected: status.connected,
            connectionMode,
            requestedScope: LINKEDIN_PORTABILITY_SCOPE,
            staticAccessTokenConfigured:
              options.staticAccessTokenConfigured ?? false,
            ...(status.expiresAt ? { expiresAt: status.expiresAt } : {}),
            ...(status.scope ? { scope: status.scope } : {}),
          };
          return privateJson(response);
        } catch {
          reportError("Failed to read LinkedIn OAuth status");
          return privateJson({ error: "LinkedIn status unavailable" }, 500);
        }
      },
    },
    {
      path: LINKEDIN_ADMIN_CONNECT_PATH,
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        if (!(await options.resolveAnchorSession(request))) {
          return privateJson({ error: "Anchor session required" }, 403);
        }
        const invalidAction = await validateConfirmedAction(
          request,
          LINKEDIN_ADMIN_MUTATION_ACTIONS.connectLinkedIn,
        );
        if (invalidAction) return invalidAction;

        let state: string | undefined;
        try {
          state = stateStore.issue(stateRedirectUri);
          const authorizationUrl =
            options.mode === "broker"
              ? await options.brokerClient.createAuthorizationUrl(state)
              : options.client.createAuthorizationUrl({
                  redirectUri: stateRedirectUri,
                  state,
                });
          return privateJson({
            authorizationUrl: authorizationUrl.toString(),
          } satisfies LinkedInAdminConnectResponse);
        } catch {
          if (state) stateStore.consume(state);
          reportError("Failed to start LinkedIn OAuth");
          return privateJson({ error: "LinkedIn connection unavailable" }, 500);
        }
      },
    },
  ];

  if (options.mode === "broker") {
    routes.push({
      path: LINKEDIN_BROKER_RETURN_PATH,
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const callbackUrl = new URL(request.url);
        const state = callbackUrl.searchParams.get("state") ?? "";
        const pending = stateStore.consume(state);
        if (pending?.redirectUri !== LINKEDIN_BROKER_RETURN_PATH) {
          return invalidStatePage();
        }

        if (
          callbackUrl.searchParams.get("provider") !==
          LINKEDIN_OAUTH_BROKER_PROVIDER_ID
        ) {
          return errorPage(
            "Authorization invalid",
            "The broker returned an unexpected provider. No credential was stored.",
            400,
          );
        }
        if (callbackUrl.searchParams.has("error")) {
          return errorPage(
            "Authorization declined",
            "LinkedIn did not grant the requested portability permission. No credential was stored.",
            400,
          );
        }

        const grant = callbackUrl.searchParams.get("grant")?.trim();
        if (!grant) {
          return errorPage(
            "Authorization incomplete",
            "The broker returned no credential grant. Start a new connection from Admin.",
            400,
          );
        }

        try {
          const token = await options.brokerClient.redeemGrant(grant);
          await options.tokenStore.storeToken(token);
          return redirect(adminReturnUrl("connected"));
        } catch {
          reportError("Managed LinkedIn OAuth callback failed");
          return errorPage(
            "Connection failed",
            "Rover could not redeem the credential grant. No usable connection was established.",
            502,
          );
        }
      },
    });
  } else {
    routes.push({
      path: LINKEDIN_DIRECT_CALLBACK_PATH,
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const callbackUrl = new URL(request.url);
        const state = callbackUrl.searchParams.get("state") ?? "";
        const pending = stateStore.consume(state);
        if (!pending) return invalidStatePage();

        if (callbackUrl.searchParams.has("error")) {
          return errorPage(
            "Authorization declined",
            "LinkedIn did not grant the requested portability permission. No credential was stored.",
            400,
          );
        }

        const code = callbackUrl.searchParams.get("code")?.trim();
        if (!code) {
          return errorPage(
            "Authorization incomplete",
            "LinkedIn returned no authorization code. Start a new connection from Admin.",
            400,
          );
        }

        try {
          const token = await options.client.exchangeCode({
            code,
            redirectUri: pending.redirectUri,
          });
          await options.tokenStore.storeToken(token);
          return redirect(adminReturnUrl("connected"));
        } catch {
          reportError("Direct LinkedIn OAuth callback failed");
          return errorPage(
            "Connection failed",
            "Rover could not complete the credential exchange. No usable connection was established.",
            502,
          );
        }
      },
    });
  }

  routes.push({
    path: LINKEDIN_ADMIN_DISCONNECT_PATH,
    method: "POST",
    public: true,
    handler: async (request): Promise<Response> => {
      if (!(await options.resolveAnchorSession(request))) {
        return privateJson({ error: "Anchor session required" }, 403);
      }
      const invalidAction = await validateConfirmedAction(
        request,
        LINKEDIN_ADMIN_MUTATION_ACTIONS.disconnectLinkedIn,
      );
      if (invalidAction) return invalidAction;

      try {
        await options.tokenStore.clearToken();
        return privateJson({
          disconnected: true,
        } satisfies LinkedInAdminDisconnectResponse);
      } catch {
        reportError("Failed to disconnect LinkedIn OAuth");
        return privateJson({ error: "LinkedIn disconnect failed" }, 500);
      }
    },
  });

  return routes;
}
