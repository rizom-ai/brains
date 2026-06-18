import { randomBytes } from "node:crypto";
import { getActiveAuthService } from "@brains/auth-service";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import {
  generateCmsConfig,
  type CmsConfig,
  type EntityDisplayMap,
} from "@brains/cms-config";
import { renderCmsShellHtml } from "./cms-shell";
import { serializeForScript } from "./script-literal";
import { toYaml, z } from "@brains/utils";
import packageJson from "../package.json";

const CMS_OAUTH_STATE_COOKIE = "brains_cms_oauth_state";
const CMS_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const CMS_AUTH_ENDPOINT = "auth";

const entityDisplayEntrySchema = z
  .object({
    label: z.string().optional(),
    pluralName: z.string().optional(),
  })
  .passthrough();

const githubOAuthConfigSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  scope: z.string().optional(),
});

const passkeyLoginConfigSchema = z.object({
  contentRepoToken: z.string().optional(),
});

const cmsPluginConfigSchema = z
  .object({
    entityDisplay: z.record(entityDisplayEntrySchema).optional(),
    routePath: z.string().default("/cms"),
    githubOAuth: githubOAuthConfigSchema.optional(),
    passkeyLogin: passkeyLoginConfigSchema.optional(),
  })
  // A brain runs a single CMS login method. Enabling both would force a chooser
  // and mix commit identities (real GitHub user vs shared PAT); keep it to one.
  .refine(
    (config) => {
      const githubEnabled = Boolean(
        configuredString(config.githubOAuth?.clientId) &&
        configuredString(config.githubOAuth?.clientSecret),
      );
      const passkeyEnabled = Boolean(
        configuredString(config.passkeyLogin?.contentRepoToken),
      );
      return !(githubEnabled && passkeyEnabled);
    },
    {
      message:
        "CMS login supports a single method per brain: configure githubOAuth or passkeyLogin, not both.",
    },
  );

type CmsPluginConfig = z.infer<typeof cmsPluginConfigSchema>;

interface EnabledGithubOAuthConfig {
  clientId: string;
  clientSecret: string;
  scope: string;
}

interface EnabledPasskeyLoginConfig {
  contentRepoToken: string;
}

interface EnabledLoginMethods {
  githubOAuth?: EnabledGithubOAuthConfig;
  passkeyLogin?: EnabledPasskeyLoginConfig;
}

interface CmsConfigBuildOptions {
  entityDisplay?: EntityDisplayMap;
  authEndpoint?: string;
  baseUrl?: string;
}

function getCmsConfigPath(routePath: string): string {
  return `${routePath.endsWith("/") ? routePath : `${routePath}/`}config.yml`;
}

function configuredString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getEnabledLoginMethods(config: CmsPluginConfig): EnabledLoginMethods {
  const clientId = configuredString(config.githubOAuth?.clientId);
  const clientSecret = configuredString(config.githubOAuth?.clientSecret);
  const contentRepoToken = configuredString(
    config.passkeyLogin?.contentRepoToken,
  );

  return {
    ...(clientId && clientSecret
      ? {
          githubOAuth: {
            clientId,
            clientSecret,
            scope: configuredString(config.githubOAuth?.scope) ?? "repo",
          },
        }
      : {}),
    ...(contentRepoToken ? { passkeyLogin: { contentRepoToken } } : {}),
  };
}

function hasEnabledLogin(loginMethods: EnabledLoginMethods): boolean {
  return Boolean(loginMethods.githubOAuth ?? loginMethods.passkeyLogin);
}

function getCmsConfigOptions(
  config: CmsPluginConfig,
  loginMethods: EnabledLoginMethods,
  context?: ServicePluginContext,
): CmsConfigBuildOptions {
  const entityDisplay =
    (config.entityDisplay as EntityDisplayMap | undefined) ??
    (context?.entityDisplay as EntityDisplayMap | undefined);
  return {
    ...(entityDisplay ? { entityDisplay } : {}),
    ...(hasEnabledLogin(loginMethods)
      ? { authEndpoint: CMS_AUTH_ENDPOINT }
      : {}),
  };
}

async function getRepoInfo(
  context: ServicePluginContext,
): Promise<{ repo: string; branch: string }> {
  const repoInfo = await context.messaging.send<
    Record<string, never>,
    { repo: string; branch: string }
  >({ type: "git-sync:get-repo-info", payload: {} });

  if ("noop" in repoInfo || !repoInfo.success || !repoInfo.data) {
    throw new Error("CMS config unavailable: git-sync repo info unavailable");
  }

  const { repo, branch } = repoInfo.data;
  if (!repo || !branch) {
    throw new Error("CMS config unavailable: git-sync repo info incomplete");
  }

  return { repo, branch };
}

async function buildCmsConfig(
  context: ServicePluginContext,
  options: CmsConfigBuildOptions = {},
): Promise<CmsConfig> {
  const { repo, branch } = await getRepoInfo(context);
  return generateCmsConfig({
    repo,
    branch,
    ...(options.baseUrl && { baseUrl: options.baseUrl }),
    ...(options.authEndpoint && { authEndpoint: options.authEndpoint }),
    entityTypes: context.entityService.getEntityTypes(),
    getFrontmatterSchema: (type) =>
      context.entities.getEffectiveFrontmatterSchema(type),
    getAdapter: (type) => context.entities.getAdapter(type),
    ...(options.entityDisplay && { entityDisplay: options.entityDisplay }),
  });
}

export async function buildCmsConfigYaml(
  context: ServicePluginContext,
  options: CmsConfigBuildOptions = {},
): Promise<string> {
  return toYaml(await buildCmsConfig(context, options));
}

export class CmsPlugin extends ServicePlugin<
  CmsPluginConfig,
  Partial<CmsPluginConfig>
> {
  constructor(config: Partial<CmsPluginConfig> = {}) {
    super("cms", packageJson, config, cmsPluginConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.endpoints.register({
      label: "CMS",
      url: this.config.routePath,
      priority: 40,
      visibility: "anchor",
    });
    context.interactions.register({
      id: "cms",
      label: "CMS",
      description: "Edit and manage content through the browser CMS.",
      href: this.config.routePath,
      kind: "admin",
      priority: 40,
      visibility: "anchor",
    });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    const cmsConfigPath = getCmsConfigPath(this.config.routePath);
    const loginMethods = getEnabledLoginMethods(this.config);
    const authRoutes: WebRouteDefinition[] = [];

    if (loginMethods.githubOAuth || loginMethods.passkeyLogin) {
      authRoutes.push({
        path: "/auth",
        method: "GET",
        public: true,
        handler: async (request): Promise<Response> =>
          this.handleAuth(request, loginMethods),
      });
    }

    if (loginMethods.githubOAuth) {
      const githubOAuth = loginMethods.githubOAuth;
      authRoutes.push({
        path: "/auth/callback",
        method: "GET",
        public: true,
        handler: async (request): Promise<Response> =>
          this.handleGitHubCallback(request, githubOAuth),
      });
    }

    if (loginMethods.passkeyLogin) {
      const passkeyLogin = loginMethods.passkeyLogin;
      authRoutes.push({
        path: "/auth/cms-token",
        method: "POST",
        public: true,
        handler: async (request): Promise<Response> =>
          this.handleCmsToken(request, passkeyLogin),
      });
    }

    return [
      {
        path: this.config.routePath,
        method: "GET",
        public: true,
        handler: async (request): Promise<Response> => {
          if (loginMethods.passkeyLogin) {
            if (!(await hasOperatorSession(request))) {
              return new Response(null, {
                status: 302,
                headers: {
                  Location: `/login?return_to=${encodeURIComponent(
                    this.config.routePath,
                  )}`,
                  "Cache-Control": "no-store",
                },
              });
            }

            return htmlResponse(
              renderCmsShellHtml({
                cmsConfigPath,
                authTokenEndpoint: "/auth/cms-token",
              }),
            );
          }

          return htmlResponse(renderCmsShellHtml({ cmsConfigPath }));
        },
      },
      {
        path: cmsConfigPath,
        method: "GET",
        public: true,
        handler: async (request): Promise<Response> => {
          try {
            const configOptions = getCmsConfigOptions(
              this.config,
              loginMethods,
              this.getContext(),
            );
            const yaml = await buildCmsConfigYaml(this.getContext(), {
              ...configOptions,
              ...(configOptions.authEndpoint
                ? { baseUrl: resolveAuthOrigin(this.getContext(), request) }
                : {}),
            });
            return new Response(yaml, {
              headers: { "Content-Type": "application/yaml; charset=utf-8" },
            });
          } catch (error) {
            return new Response(
              error instanceof Error ? error.message : "CMS unavailable",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            );
          }
        },
      },
      ...authRoutes,
    ];
  }

  private async handleAuth(
    request: Request,
    loginMethods: EnabledLoginMethods,
  ): Promise<Response> {
    // A brain enables exactly one login method (enforced at config time), and
    // Sveltia opens /auth with no method hint, so dispatch purely on what is
    // configured.
    if (loginMethods.githubOAuth) {
      return this.redirectToGitHub(request, loginMethods.githubOAuth);
    }

    if (loginMethods.passkeyLogin) {
      // An operator who already holds a session skips the passkey prompt and
      // goes straight to releasing the PAT.
      const renderPage = (await hasOperatorSession(request))
        ? renderPasskeyTokenPage
        : renderPasskeyLoginPage;
      return htmlResponse(
        renderPage(resolveAuthOrigin(this.getContext(), request)),
      );
    }

    return textResponse("CMS login is not enabled", 404);
  }

  private redirectToGitHub(
    request: Request,
    githubOAuth: EnabledGithubOAuthConfig,
  ): Response {
    const state = randomBytes(32).toString("base64url");
    const redirectUri = `${resolveAuthOrigin(this.getContext(), request)}/auth/callback`;
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", githubOAuth.clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", githubOAuth.scope);
    authorizeUrl.searchParams.set("state", state);

    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizeUrl.toString(),
        "Set-Cookie": stateCookie(state, request),
        "Cache-Control": "no-store",
      },
    });
  }

  private async handleGitHubCallback(
    request: Request,
    githubOAuth: EnabledGithubOAuthConfig,
  ): Promise<Response> {
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    if (error) {
      const description = url.searchParams.get("error_description") ?? error;
      return oauthErrorResponse(`GitHub OAuth failed: ${description}`);
    }

    const state = url.searchParams.get("state");
    const expectedState = getCookie(
      request.headers.get("cookie"),
      CMS_OAUTH_STATE_COOKIE,
    );
    if (!state || !expectedState || state !== expectedState) {
      return oauthErrorResponse("GitHub OAuth state did not match");
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return oauthErrorResponse("GitHub OAuth callback did not include a code");
    }

    const redirectUri = `${resolveAuthOrigin(this.getContext(), request)}/auth/callback`;
    const tokenResult = await exchangeGitHubCode(
      githubOAuth,
      code,
      redirectUri,
    );
    if (!tokenResult.success) {
      return oauthErrorResponse(tokenResult.error);
    }

    return htmlResponse(
      renderTokenHandshakePage(
        tokenResult.token,
        resolveAuthOrigin(this.getContext(), request),
      ),
      200,
      { "Set-Cookie": clearStateCookie() },
    );
  }

  private async handleCmsToken(
    request: Request,
    passkeyLogin: EnabledPasskeyLoginConfig,
  ): Promise<Response> {
    const authService = getActiveAuthService();
    const session = await authService?.getOperatorSession(request);
    if (!session) {
      return jsonResponse({ error: "Operator session required" }, 401);
    }

    return jsonResponse(
      { token: passkeyLogin.contentRepoToken, provider: "github" },
      200,
      { "Cache-Control": "no-store" },
    );
  }
}

export function cmsPlugin(config?: Partial<CmsPluginConfig>): CmsPlugin {
  return new CmsPlugin(config);
}

async function exchangeGitHubCode(
  githubOAuth: EnabledGithubOAuthConfig,
  code: string,
  redirectUri: string,
): Promise<
  { success: true; token: string } | { success: false; error: string }
> {
  const body = new URLSearchParams({
    client_id: githubOAuth.clientId,
    client_secret: githubOAuth.clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { success: false, error: "GitHub token response was not JSON" };
  }

  if (!response.ok) {
    return {
      success: false,
      error: githubOAuthError(payload) ?? "GitHub token exchange failed",
    };
  }

  if (isRecord(payload) && typeof payload["error"] === "string") {
    return {
      success: false,
      error:
        typeof payload["error_description"] === "string"
          ? payload["error_description"]
          : payload["error"],
    };
  }

  const token = isRecord(payload) ? payload["access_token"] : undefined;
  if (typeof token !== "string" || token.length === 0) {
    return { success: false, error: "GitHub token response omitted token" };
  }

  return { success: true, token };
}

function githubOAuthError(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  if (typeof payload["error_description"] === "string") {
    return payload["error_description"];
  }
  return typeof payload["error"] === "string" ? payload["error"] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveAuthOrigin(
  context: ServicePluginContext,
  request: Request,
): string {
  const requestOrigin = new URL(request.url).origin;
  if (isLocalOrigin(requestOrigin)) return requestOrigin;
  return context.siteUrl ?? requestOrigin;
}

function isLocalOrigin(origin: string): boolean {
  const { hostname } = new URL(origin);
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function stateCookie(state: string, request: Request): string {
  const secure = isLocalOrigin(new URL(request.url).origin) ? "" : "; Secure";
  return `${CMS_OAUTH_STATE_COOKIE}=${state}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=${CMS_OAUTH_STATE_TTL_SECONDS}${secure}`;
}

function clearStateCookie(): string {
  return `${CMS_OAUTH_STATE_COOKIE}=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getCookie(
  cookieHeader: string | null,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const cookie of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = cookie.trim().split("=");
    if (rawKey === name) {
      return rawValue.join("=");
    }
  }
  return undefined;
}

function htmlResponse(
  html: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function oauthErrorResponse(message: string): Response {
  return htmlResponse(
    `<!doctype html><html><body><h1>CMS login failed</h1><p>${escapeHtml(
      message,
    )}</p></body></html>`,
    400,
    { "Set-Cookie": clearStateCookie() },
  );
}

async function hasOperatorSession(request: Request): Promise<boolean> {
  return Boolean(await getActiveAuthService()?.getOperatorSession(request));
}

function renderPasskeyLoginPage(targetOrigin: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CMS passkey login</title>
    ${authPageStyles()}
  </head>
  <body>
    <main class="card">
      <h1>CMS passkey login</h1>
      <p>Use your brain passkey to release the CMS GitHub credential.</p>
      <button type="button" id="login">Continue with passkey</button>
      <p id="status" role="status"></p>
    </main>
    <script>${webauthnBrowserHelpers()}
    ${tokenHandshakeScript(targetOrigin)}
    document.getElementById('login').addEventListener('click', async () => {
      const status = document.getElementById('status');
      try {
        status.textContent = 'Waiting for passkey...';
        const options = await fetchJSON('/webauthn/auth/options', { method: 'POST' });
        const credential = await navigator.credentials.get({ publicKey: prepareRequestOptions(options) });
        await fetchJSON('/webauthn/auth/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(credentialToJSON(credential)),
        });
        status.textContent = 'Authorizing CMS...';
        const result = await fetchJSON('/auth/cms-token', { method: 'POST' });
        postGitHubToken(result.token);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    });</script>
  </body>
</html>`;
}

function renderPasskeyTokenPage(targetOrigin: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CMS authorization</title>
    ${authPageStyles()}
  </head>
  <body>
    <main class="card">
      <h1>CMS authorization</h1>
      <p id="status" role="status">Authorizing CMS...</p>
    </main>
    <script>${tokenHandshakeScript(targetOrigin)}
    ${cmsTokenFetchScript()}</script>
  </body>
</html>`;
}

function renderTokenHandshakePage(token: string, targetOrigin: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CMS login complete</title>
    ${authPageStyles()}
  </head>
  <body>
    <main class="card">
      <h1>CMS login complete</h1>
      <p id="status" role="status">Returning to the content manager...</p>
    </main>
    <script>${tokenHandshakeScript(targetOrigin)}
    postGitHubToken(${serializeForScript(token)});</script>
  </body>
</html>`;
}

function cmsTokenFetchScript(): string {
  return `
    (async () => {
      const status = document.getElementById('status');
      try {
        const response = await fetch('/auth/cms-token', { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || response.statusText);
        postGitHubToken(result.token);
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : String(error);
      }
    })();
  `;
}

function tokenHandshakeScript(targetOrigin: string): string {
  return `
    const targetOrigin = ${serializeForScript(targetOrigin)};
    function postGitHubToken(token) {
      const status = document.getElementById('status');
      if (!token) throw new Error('CMS token response omitted token');
      if (!window.opener) {
        if (status) status.textContent = 'No CMS opener window was found.';
        return;
      }
      const data = JSON.stringify({ token, provider: 'github' });
      const message = 'authorization:github:success:' + data;
      function sendToken() {
        window.opener.postMessage(message, targetOrigin);
        window.close();
      }
      window.addEventListener('message', (event) => {
        if (event.origin === targetOrigin && event.data === 'authorizing:github') {
          sendToken();
        }
      }, false);
      window.opener.postMessage('authorizing:github', targetOrigin);
    }
  `;
}

function webauthnBrowserHelpers(): string {
  return `
    function base64urlToBuffer(value) {
      const padded = value + '='.repeat((4 - value.length % 4) % 4);
      const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(base64);
      return Uint8Array.from(binary, c => c.charCodeAt(0));
    }
    function bufferToBase64url(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
    }
    function prepareRequestOptions(options) {
      return {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        allowCredentials: (options.allowCredentials || []).map(credential => ({
          ...credential,
          id: base64urlToBuffer(credential.id),
        })),
      };
    }
    function encodeResponseField(response, output, key) {
      const value = response[key];
      if (value instanceof ArrayBuffer) output[key] = bufferToBase64url(value);
      else if (value !== null && value !== undefined) output[key] = value;
    }
    function credentialToJSON(credential) {
      const source = credential.response;
      const response = {};
      encodeResponseField(source, response, 'clientDataJSON');
      encodeResponseField(source, response, 'authenticatorData');
      encodeResponseField(source, response, 'signature');
      encodeResponseField(source, response, 'userHandle');
      return {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response,
        authenticatorAttachment: credential.authenticatorAttachment,
        clientExtensionResults: credential.getClientExtensionResults(),
      };
    }
    async function fetchJSON(url, init) {
      const response = await fetch(url, init);
      let payload = null;
      try { payload = await response.json(); } catch {}
      if (!response.ok) {
        const message = payload && (payload.error_description || payload.error) ? (payload.error_description || payload.error) : response.statusText;
        throw new Error(message);
      }
      return payload;
    }
  `;
}

function authPageStyles(): string {
  return `<style>
    :root { color-scheme: dark; --ink: #080711; --panel: #161326; --paper: #f3eadc; --muted: #b9ad9b; --accent: #ff8b3d; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: var(--paper); background: radial-gradient(circle at 20% 10%, rgba(255,139,61,.22), transparent 28rem), linear-gradient(145deg, #05040d, var(--ink)); }
    .card { width: min(100%, 34rem); border: 1px solid rgba(243,234,220,.14); border-radius: 6px; padding: 30px; background: var(--panel); box-shadow: 0 28px 70px -34px rgba(0,0,0,.72); }
    h1 { margin: 0; font-size: clamp(2rem, 7vw, 3.2rem); line-height: 1; letter-spacing: -.04em; }
    p { color: var(--muted); line-height: 1.55; }
    button { margin-top: 24px; border: 1px solid rgba(255,139,61,.55); border-radius: 999px; padding: .82rem 1.08rem; font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; background: var(--accent); color: #080711; cursor: pointer; }
    [role='status'] { min-height: 1.5em; }
  </style>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}
