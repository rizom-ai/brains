import type { WebRouteDefinition } from "@brains/plugins";
import {
  LINKEDIN_PORTABILITY_SCOPE,
  type LinkedInOAuthConnectionStatus,
  type LinkedInOAuthTokenStore,
  type LinkedInOAuthClient,
} from "./linkedin-oauth-client";
import { LinkedInOAuthStateStore } from "./linkedin-oauth-state-store";

export const LINKEDIN_OAUTH_STATUS_PATH = "/linkedin";
export const LINKEDIN_OAUTH_CONNECT_PATH = "/linkedin/connect";
export const LINKEDIN_OAUTH_CALLBACK_PATH = "/linkedin/callback";
export const LINKEDIN_OAUTH_DISCONNECT_PATH = "/linkedin/disconnect";

export type LinkedInOperatorSessionResolver = (
  request: Request,
) => Promise<boolean>;

export interface LinkedInOAuthRoutesOptions {
  client: LinkedInOAuthClient;
  tokenStore: LinkedInOAuthTokenStore;
  stateStore?: LinkedInOAuthStateStore | undefined;
  redirectUri: string;
  resolveOperatorSession: LinkedInOperatorSessionResolver;
  staticAccessTokenConfigured?: boolean | undefined;
  reportError?: ((message: string, error: unknown) => void) | undefined;
}

const pageHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Content-Type": "text/html; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function redirect(location: string, status: 302 | 303): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Location: location,
      "Referrer-Policy": "no-referrer",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: pageHeaders });
}

function renderStatusPage(
  status: LinkedInOAuthConnectionStatus,
  options: {
    staticAccessTokenConfigured: boolean;
    notice?: "connected" | "disconnected" | undefined;
  },
): string {
  const connected = status.connected;
  const expiresAt = status.expiresAt
    ? new Date(status.expiresAt).toISOString()
    : undefined;
  const fallback = options.staticAccessTokenConfigured;
  const stateLabel = connected
    ? "OAuth connection active"
    : fallback
      ? "Static fallback active"
      : "Not connected";
  const detail = connected
    ? "Rover can request sanctioned professional-profile data until this credential expires."
    : fallback
      ? "Imports can still use the legacy static token. Connect OAuth to move credential control into Rover."
      : "Connect your member account before importing professional-profile data.";
  const notice =
    options.notice === "connected"
      ? '<div class="notice">Connection established. The credential is stored only on this brain.</div>'
      : options.notice === "disconnected"
        ? '<div class="notice">OAuth credential removed from this brain.</div>'
        : "";
  const metadata = connected
    ? `<dl><div><dt>Scope</dt><dd>${escapeHtml(status.scope ?? LINKEDIN_PORTABILITY_SCOPE)}</dd></div>${
        expiresAt
          ? `<div><dt>Expires</dt><dd><time datetime="${expiresAt}">${expiresAt}</time></dd></div>`
          : ""
      }</dl>`
    : "";
  const action = connected
    ? `<form method="post" action="${LINKEDIN_OAUTH_DISCONNECT_PATH}"><button class="disconnect" type="submit">Disconnect LinkedIn</button></form>`
    : `<form method="post" action="${LINKEDIN_OAUTH_CONNECT_PATH}"><button type="submit">Connect with LinkedIn <span aria-hidden="true">↗</span></button></form>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LinkedIn connection · Rover</title>
<style>
:root{color-scheme:dark;--ink:#e9edf4;--muted:#99a4b5;--line:#2a3546;--panel:#111925;--blue:#4ea1ff;--green:#77d6a4;--amber:#e5b96b;--danger:#f08e8e}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#09101a;color:var(--ink);font-family:ui-monospace,"SFMono-Regular",Consolas,monospace;background-image:linear-gradient(rgba(78,161,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(78,161,255,.035) 1px,transparent 1px);background-size:32px 32px}
main{width:min(920px,calc(100% - 32px));margin:0 auto;padding:clamp(40px,9vw,112px) 0}.kicker{margin:0 0 28px;color:var(--blue);font-size:12px;letter-spacing:.16em;text-transform:uppercase}.grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);border:1px solid var(--line);background:rgba(17,25,37,.94);box-shadow:0 24px 80px rgba(0,0,0,.32)}header,.status{padding:clamp(28px,5vw,64px)}header{border-right:1px solid var(--line)}h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(48px,8vw,88px);font-weight:400;line-height:.86;letter-spacing:-.045em}h1 em{color:var(--blue);font-weight:400}header p{max-width:48ch;margin:34px 0 0;color:var(--muted);font:15px/1.7 Georgia,"Times New Roman",serif}.signal{display:flex;align-items:center;gap:10px;margin-bottom:24px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.09em}.dot{width:9px;height:9px;border-radius:50%;background:${connected ? "var(--green)" : fallback ? "var(--amber)" : "var(--muted)"};box-shadow:0 0 18px currentColor}.status h2{margin:0;font-size:20px;line-height:1.35}.status>p{margin:14px 0 28px;color:var(--muted);font-size:13px;line-height:1.65}dl{margin:0 0 28px;border-top:1px solid var(--line)}dl div{padding:13px 0;border-bottom:1px solid var(--line)}dt{color:var(--muted);font-size:10px;letter-spacing:.11em;text-transform:uppercase}dd{margin:6px 0 0;overflow-wrap:anywhere;font-size:11px;line-height:1.5}button{width:100%;border:0;padding:14px 16px;background:var(--blue);color:#06101d;font:700 12px/1 ui-monospace,"SFMono-Regular",Consolas,monospace;letter-spacing:.04em;cursor:pointer;transition:transform .15s ease,filter .15s ease}button:hover{filter:brightness(1.12);transform:translateY(-1px)}button:focus-visible{outline:2px solid var(--ink);outline-offset:3px}.disconnect{background:transparent;color:var(--danger);border:1px solid #633e47}.notice{margin-bottom:18px;padding:12px 14px;border-left:2px solid var(--green);background:rgba(119,214,164,.08);color:#b9e8cd;font-size:12px;line-height:1.5}.foot{display:flex;justify-content:space-between;gap:24px;margin-top:20px;color:var(--muted);font-size:10px;line-height:1.5}.foot a{color:var(--ink)}
@media(max-width:720px){main{padding:24px 0}.grid{grid-template-columns:1fr}header{border-right:0;border-bottom:1px solid var(--line)}.foot{flex-direction:column}}
</style>
</head>
<body><main><p class="kicker">Rover / Portability connection 01</p>${notice}<section class="grid"><header><h1>LinkedIn<br><em>connection</em></h1><p>Bring sanctioned professional-profile data into your owner-controlled profile. Imported fields remain provider-neutral, reviewed, and additive.</p></header><div class="status"><div class="signal"><span class="dot"></span>${stateLabel}</div><h2>${stateLabel}</h2><p>${detail}</p>${metadata}${action}</div></section><div class="foot"><span>Requested permission: ${LINKEDIN_PORTABILITY_SCOPE}</span><a href="/">Return to Rover</a></div></main></body>
</html>`;
}

function renderCallbackError(title: string, detail: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Rover</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09101a;color:#e9edf4;font-family:Georgia,"Times New Roman",serif}.card{width:min(560px,calc(100% - 32px));padding:48px;border:1px solid #2a3546;background:#111925}small{color:#4ea1ff;font:12px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}h1{font-size:42px;font-weight:400;margin:18px 0}p{color:#aab3c1;line-height:1.65}a{display:inline-block;margin-top:18px;color:#4ea1ff;font-family:ui-monospace,monospace}</style></head><body><main class="card"><small>LinkedIn / OAuth</small><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><a href="${LINKEDIN_OAUTH_STATUS_PATH}">Return to connection status</a></main></body></html>`;
}

/** Browser boundary for the provider-specific LinkedIn authorization flow. */
export function createLinkedInOAuthRoutes(
  options: LinkedInOAuthRoutesOptions,
): WebRouteDefinition[] {
  const redirectUri = new URL(options.redirectUri);
  if (!["http:", "https:"].includes(redirectUri.protocol)) {
    throw new Error("LinkedIn OAuth redirect URI must use HTTP or HTTPS");
  }
  if (
    redirectUri.pathname !== LINKEDIN_OAUTH_CALLBACK_PATH ||
    redirectUri.search ||
    redirectUri.hash
  ) {
    throw new Error(
      `LinkedIn OAuth redirect URI must end at ${LINKEDIN_OAUTH_CALLBACK_PATH}`,
    );
  }
  const normalizedRedirectUri = redirectUri.toString();
  const stateStore = options.stateStore ?? new LinkedInOAuthStateStore();
  const reportError = (message: string, error: unknown): void => {
    options.reportError?.(message, error);
  };

  return [
    {
      path: LINKEDIN_OAUTH_STATUS_PATH,
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        if (!(await options.resolveOperatorSession(request))) {
          return redirect(
            `/login?return_to=${encodeURIComponent(LINKEDIN_OAUTH_STATUS_PATH)}`,
            302,
          );
        }
        try {
          const status = await options.tokenStore.getStatus();
          const noticeValue = new URL(request.url).searchParams.get("status");
          const notice =
            noticeValue === "connected" || noticeValue === "disconnected"
              ? noticeValue
              : undefined;
          return html(
            renderStatusPage(status, {
              staticAccessTokenConfigured:
                options.staticAccessTokenConfigured ?? false,
              ...(notice ? { notice } : {}),
            }),
          );
        } catch (error) {
          reportError("Failed to read LinkedIn OAuth status", error);
          return html(
            renderCallbackError(
              "Status unavailable",
              "Rover could not read the stored LinkedIn connection. Check the server logs before trying again.",
            ),
            500,
          );
        }
      },
    },
    {
      path: LINKEDIN_OAUTH_CONNECT_PATH,
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        if (!(await options.resolveOperatorSession(request))) {
          return new Response("Forbidden", { status: 403 });
        }
        try {
          const state = stateStore.issue(normalizedRedirectUri);
          const authorizationUrl = options.client.createAuthorizationUrl({
            redirectUri: normalizedRedirectUri,
            state,
          });
          return redirect(authorizationUrl.toString(), 303);
        } catch (error) {
          reportError("Failed to start LinkedIn OAuth", error);
          return html(
            renderCallbackError(
              "Connection unavailable",
              "Rover could not start LinkedIn authorization. Check the server configuration and try again.",
            ),
            500,
          );
        }
      },
    },
    {
      path: LINKEDIN_OAUTH_CALLBACK_PATH,
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const callbackUrl = new URL(request.url);
        const state = callbackUrl.searchParams.get("state") ?? "";
        const pending = stateStore.consume(state);
        if (!pending) {
          return html(
            renderCallbackError(
              "Authorization expired",
              "This callback is invalid, expired, or already used. Start a new connection from Rover.",
            ),
            400,
          );
        }

        if (callbackUrl.searchParams.has("error")) {
          return html(
            renderCallbackError(
              "Authorization declined",
              "LinkedIn did not grant the requested portability permission. No credential was stored.",
            ),
            400,
          );
        }

        const code = callbackUrl.searchParams.get("code")?.trim();
        if (!code) {
          return html(
            renderCallbackError(
              "Authorization incomplete",
              "LinkedIn returned no authorization code. Start a new connection from Rover.",
            ),
            400,
          );
        }

        try {
          const token = await options.client.exchangeCode({
            code,
            redirectUri: pending.redirectUri,
          });
          await options.tokenStore.storeToken(token);
          return redirect(
            `${LINKEDIN_OAUTH_STATUS_PATH}?status=connected`,
            303,
          );
        } catch (error) {
          reportError("LinkedIn OAuth callback failed", error);
          return html(
            renderCallbackError(
              "Connection failed",
              "Rover could not complete the credential exchange. No usable connection was established.",
            ),
            502,
          );
        }
      },
    },
    {
      path: LINKEDIN_OAUTH_DISCONNECT_PATH,
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        if (!(await options.resolveOperatorSession(request))) {
          return new Response("Forbidden", { status: 403 });
        }
        try {
          await options.tokenStore.clearToken();
          return redirect(
            `${LINKEDIN_OAUTH_STATUS_PATH}?status=disconnected`,
            303,
          );
        } catch (error) {
          reportError("Failed to disconnect LinkedIn OAuth", error);
          return html(
            renderCallbackError(
              "Disconnect failed",
              "Rover could not remove the stored credential. Check the server logs before trying again.",
            ),
            500,
          );
        }
      },
    },
  ];
}
