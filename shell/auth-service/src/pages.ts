import type { ValidAuthorizationRequest } from "./types";

const AUTH_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,30..100;1,9..144,300..900,30..100&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap";

export function renderSetupPage(setupToken: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Set up passkey</title>
    ${authPageHeadAssets()}
  </head>
  <body>
    <main class="card">
      <h1>Set up your brain passkey</h1>
      <p>Register a passkey to become the operator for this brain.</p>
      <button type="button" id="register">Register passkey</button>
      <p id="status" role="status"></p>
    </main>
    <script>${webauthnBrowserHelpers()}
    document.getElementById('register').addEventListener('click', async () => {
      const status = document.getElementById('status');
      try {
        status.textContent = 'Waiting for passkey...';
        const setupToken = ${JSON.stringify(setupToken)};
        const options = await fetchJSON('/webauthn/register/options?setup_token=' + encodeURIComponent(setupToken), { method: 'POST' });
        const credential = await navigator.credentials.create({ publicKey: prepareCreationOptions(options) });
        await fetchJSON('/webauthn/register/verify?setup_token=' + encodeURIComponent(setupToken), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(credentialToJSON(credential)),
        });
        status.textContent = 'Passkey registered. You are logged in.';
        location.href = '/';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    });</script>
  </body>
</html>`;
}

export function renderLoginPage(
  returnTo: string,
  title = "Operator login",
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    ${authPageHeadAssets()}
  </head>
  <body>
    <main class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>Use your passkey to continue.</p>
      <button type="button" id="login">Continue with passkey</button>
      <p id="status" role="status"></p>
    </main>
    <script>${webauthnBrowserHelpers()}
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
        location.href = ${JSON.stringify(returnTo)};
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    });</script>
  </body>
</html>`;
}

function authPageHeadAssets(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${AUTH_FONTS_URL}" rel="stylesheet" />
    <style>
      :root {
        --ink: #0a0819;
        --ink-raised: #14112b;
        --ink-deep: #05040f;
        --paper: #f1eadd;
        --paper-dim: #bfb7a6;
        --paper-mute: #7a7263;
        --rule-strong: rgba(241, 234, 221, 0.14);
        --accent: #ff8b3d;
        --accent-soft: rgba(255, 139, 61, 0.12);
        --err: #e26d6d;
        --font-display: "Fraunces", "Times New Roman", serif;
        --font-body: "IBM Plex Sans", -apple-system, system-ui, sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, monospace;
        color-scheme: dark;
      }
      * { box-sizing: border-box; }
      html, body { min-height: 100%; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px 18px;
        font-family: var(--font-body);
        line-height: 1.55;
        color: var(--paper);
        background:
          radial-gradient(circle at 18% 12%, rgba(255, 139, 61, 0.18), transparent 28rem),
          radial-gradient(circle at 82% 6%, rgba(241, 234, 221, 0.08), transparent 24rem),
          linear-gradient(145deg, var(--ink-deep), var(--ink));
        -webkit-font-smoothing: antialiased;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.04;
        mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
      }
      .card {
        width: min(100%, 36rem);
        position: relative;
        border: 1px solid var(--rule-strong);
        border-radius: 4px;
        padding: 30px 32px 34px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent), var(--ink-raised);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 28px 70px -34px rgba(0, 0, 0, 0.72);
      }
      .card::before {
        content: "Operator gate";
        display: block;
        margin-bottom: 16px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--paper-mute);
      }
      .card::after {
        content: "";
        position: absolute;
        left: 32px;
        top: 58px;
        width: 84px;
        height: 1px;
        background: var(--accent);
      }
      h1 {
        margin: 0;
        font-family: var(--font-display);
        font-variation-settings: "opsz" 144, "SOFT" 55, "wght" 380;
        font-size: clamp(2.25rem, 8vw, 3.5rem);
        line-height: 0.98;
        letter-spacing: -0.03em;
      }
      p { color: var(--paper-dim); margin: 18px 0 0; }
      button {
        margin-top: 24px;
        border: 1px solid rgba(255, 139, 61, 0.55);
        border-radius: 999px;
        padding: 0.82rem 1.18rem;
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: var(--accent);
        color: var(--ink-deep);
        cursor: pointer;
        box-shadow: 0 10px 28px -18px var(--accent);
      }
      button:hover { filter: brightness(1.06); transform: translateY(-1px); }
      code {
        overflow-wrap: anywhere;
        color: var(--paper);
        background: var(--accent-soft);
        border: 1px solid var(--rule-strong);
        padding: 0.08rem 0.3rem;
      }
      .scope-list { margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
      .scope-list li { border: 1px solid var(--rule-strong); border-radius: 3px; padding: 10px 12px; background: rgba(255, 255, 255, 0.025); }
      .scope-list b { display: block; color: var(--paper); }
      .scope-list span { display: block; color: var(--paper-dim); font-size: 0.94rem; }
      [role='status'] { min-height: 1.5em; color: var(--paper-mute); }
      @media (max-width: 520px) {
        .card { padding: 24px 22px 28px; }
        .card::after { left: 22px; }
      }
    </style>`;
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
    function prepareCreationOptions(options) {
      return {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        user: { ...options.user, id: base64urlToBuffer(options.user.id) },
        excludeCredentials: (options.excludeCredentials || []).map(credential => ({
          ...credential,
          id: base64urlToBuffer(credential.id),
        })),
      };
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

      // Authenticator response fields are exposed as WebIDL attributes, not
      // enumerable object keys, so copy the known registration/authentication
      // fields explicitly.
      encodeResponseField(source, response, 'clientDataJSON');
      encodeResponseField(source, response, 'attestationObject');
      encodeResponseField(source, response, 'authenticatorData');
      encodeResponseField(source, response, 'signature');
      encodeResponseField(source, response, 'userHandle');

      if (typeof source.getTransports === 'function') {
        response.transports = source.getTransports();
      }
      if (typeof source.getAuthenticatorData === 'function') {
        response.authenticatorData = bufferToBase64url(source.getAuthenticatorData());
      }
      if (typeof source.getPublicKey === 'function') {
        const publicKey = source.getPublicKey();
        if (publicKey) response.publicKey = bufferToBase64url(publicKey);
      }
      if (typeof source.getPublicKeyAlgorithm === 'function') {
        response.publicKeyAlgorithm = source.getPublicKeyAlgorithm();
      }

      return {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response,
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: credential.authenticatorAttachment,
      };
    }
    async function fetchJSON(url, init) {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error_description || body.error || response.statusText);
      return body;
    }
  `;
}

function renderScopeItems(scope: string | undefined): string {
  const scopes = scope?.split(/\s+/).filter(Boolean) ?? [];
  if (scopes.length === 0) {
    return renderScopeItem(
      "Sign-in only",
      "Issue an authorization code without additional requested scopes.",
    );
  }

  return scopes
    .map((requestedScope) => {
      const copy = getScopeCopy(requestedScope);
      return renderScopeItem(copy.title, copy.description);
    })
    .join("\n        ");
}

function renderScopeItem(title: string, description: string): string {
  return `<li><b>${escapeHtml(title)}</b><span>${escapeHtml(description)}</span></li>`;
}

function getScopeCopy(scope: string): { title: string; description: string } {
  switch (scope) {
    case "openid":
      return {
        title: "Sign in",
        description: "Identify this browser session to the OAuth client.",
      };
    case "profile":
      return {
        title: "Basic profile",
        description:
          "Share the local operator profile subject with the client.",
      };
    case "email":
      return {
        title: "Email address",
        description: "Share the operator email address when one is configured.",
      };
    case "offline_access":
      return {
        title: "Offline access",
        description: "Allow the client to refresh access without asking again.",
      };
    case "mcp":
      return {
        title: "MCP access",
        description: "Use Model Context Protocol tools exposed by this brain.",
      };
    default:
      return {
        title: scope,
        description: "Requested by the OAuth client.",
      };
  }
}

export function renderAuthorizePage(
  params: ValidAuthorizationRequest,
  approvalToken: string,
): string {
  const scopeItems = renderScopeItems(params.scope);
  const hidden = {
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    approval_token: approvalToken,
    ...(params.scope ? { scope: params.scope } : {}),
    ...(params.state ? { state: params.state } : {}),
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize ${escapeHtml(params.clientName)}</title>
    ${authPageHeadAssets()}
  </head>
  <body>
    <main class="card">
      <h1>Authorize ${escapeHtml(params.clientName)}?</h1>
      <p><b>${escapeHtml(params.clientName)}</b> is requesting access to this brain.</p>
      <p>After approval, the client will return to:</p>
      <p><code>${escapeHtml(params.redirectUri)}</code></p>
      <p>Requested permissions:</p>
      <ul class="scope-list">
        ${scopeItems}
      </ul>
      <form method="post" action="/authorize">
        ${Object.entries(hidden)
          .map(
            ([name, value]) =>
              `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
          )
          .join("\n        ")}
        <button type="submit">Approve and continue</button>
      </form>
    </main>
  </body>
</html>`;
}

export function unauthorizedHtmlResponse(request: Request): Response {
  const returnTo = `${new URL(request.url).pathname}${new URL(request.url).search}`;
  return new Response(renderLoginPage(returnTo, "Operator login required"), {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
