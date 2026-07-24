export function renderAccountPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23161713'/%3E%3Crect x='7' y='7' width='18' height='18' fill='%23d8ff3e'/%3E%3C/svg%3E">
  <title>Your account</title>
  <style>
    :root {
      --paper: #f0ede4;
      --ink: #161713;
      --muted: #67685f;
      --line: #c9c6ba;
      --signal: #d8ff3e;
      --danger: #a93626;
      --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      --mono: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(90deg, transparent 0 7.9%, rgba(22,23,19,.08) 8%, transparent 8.1%),
        var(--paper);
      font-family: var(--serif);
      min-height: 100vh;
    }
    button, input { font: inherit; }
    button:focus-visible, input:focus-visible, a:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 3px;
    }
    .masthead {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      min-height: 70px;
      padding: 0 5vw 0 10vw;
      border-bottom: 1px solid var(--ink);
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; }
    .brand-mark { width: 10px; height: 10px; background: var(--signal); border: 1px solid var(--ink); }
    nav { display: flex; align-items: center; gap: 20px; }
    nav a { color: inherit; text-decoration: none; border-bottom: 1px solid transparent; }
    nav a:hover { border-color: currentColor; }
    .shell { width: min(1160px, 90vw); margin: 0 auto; padding: 72px 0 90px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 40px; align-items: end; margin-bottom: 80px; }
    .eyebrow { margin: 0 0 18px; font: 700 11px/1 var(--mono); letter-spacing: .15em; text-transform: uppercase; }
    h1 { margin: 0; max-width: 780px; font-size: clamp(58px, 9vw, 126px); font-weight: 400; line-height: .78; letter-spacing: -.065em; }
    .role-card { border-top: 8px solid var(--signal); padding-top: 14px; font-family: var(--mono); }
    .role-card span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .1em; }
    .role-card strong { display: block; margin-top: 7px; font-size: 20px; text-transform: capitalize; }
    .layout { display: grid; grid-template-columns: 1fr 1.65fr; gap: clamp(42px, 8vw, 110px); }
    .rail { position: relative; }
    .rail::before { content: "01—04"; position: absolute; left: -5vw; top: 3px; font: 10px/1 var(--mono); writing-mode: vertical-rl; }
    section { border-top: 1px solid var(--ink); padding: 20px 0 54px; }
    section h2 { margin: 0 0 9px; font: 700 13px/1.2 var(--mono); text-transform: uppercase; letter-spacing: .09em; }
    .section-note { margin: 0 0 24px; color: var(--muted); font-size: 15px; line-height: 1.45; }
    .name-form { display: grid; gap: 12px; }
    label { font: 11px/1 var(--mono); text-transform: uppercase; letter-spacing: .08em; }
    input {
      width: 100%;
      border: 0;
      border-bottom: 2px solid var(--ink);
      border-radius: 0;
      padding: 10px 0 12px;
      background: transparent;
      color: inherit;
      font-size: 25px;
    }
    .button-row { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 8px; }
    .button {
      min-height: 40px;
      border: 1px solid var(--ink);
      border-radius: 0;
      padding: 9px 14px;
      background: var(--ink);
      color: var(--paper);
      cursor: pointer;
      font: 700 11px/1 var(--mono);
      letter-spacing: .06em;
      text-transform: uppercase;
      transition: transform 120ms ease, background 120ms ease, color 120ms ease;
    }
    .button:hover { transform: translate(-2px, -2px); box-shadow: 2px 2px 0 var(--signal); }
    .button.secondary { color: var(--ink); background: transparent; }
    .button.danger { color: var(--danger); background: transparent; border-color: var(--danger); }
    .button:disabled { cursor: wait; opacity: .55; transform: none; box-shadow: none; }
    .ledger { list-style: none; margin: 0; padding: 0; border-bottom: 1px solid var(--line); }
    .ledger li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: center; min-height: 72px; border-top: 1px solid var(--line); padding: 13px 0; }
    .ledger li:first-child { border-top-color: var(--ink); }
    .item-title { display: block; font-size: 18px; }
    .item-meta { display: block; margin-top: 5px; color: var(--muted); font: 11px/1.4 var(--mono); }
    .empty { margin: 0; padding: 20px 0; color: var(--muted); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); font-style: italic; }
    .status { min-height: 24px; margin: 18px 0 0; color: var(--muted); font: 12px/1.5 var(--mono); }
    .status.error { color: var(--danger); }
    .current { display: inline-block; margin-left: 8px; padding: 2px 6px; background: var(--signal); color: var(--ink); font: 700 9px/1.4 var(--mono); text-transform: uppercase; }
    .security-note { margin-top: 45px; padding: 18px; border: 1px solid var(--ink); box-shadow: 7px 7px 0 var(--signal); font-size: 15px; line-height: 1.5; }
    .security-note strong { display: block; margin-bottom: 7px; font: 700 11px/1 var(--mono); text-transform: uppercase; letter-spacing: .08em; }
    @media (max-width: 760px) {
      body { background: var(--paper); }
      .masthead { padding: 0 5vw; }
      nav a:not(:last-child) { display: none; }
      .shell { padding-top: 48px; }
      .hero, .layout { grid-template-columns: 1fr; }
      .hero { gap: 34px; margin-bottom: 56px; }
      .role-card { width: 180px; }
      .rail::before { display: none; }
      h1 { font-size: clamp(58px, 21vw, 92px); }
    }
    @media (prefers-reduced-motion: reduce) { .button { transition: none; } }
  </style>
</head>
<body>
  <header class="masthead">
    <div class="brand"><span class="brand-mark"></span><span>Account ledger</span></div>
    <nav aria-label="Account navigation">
      <a id="chat-link" href="/chat" hidden>Chat</a>
      <a id="admin-link" href="/admin" hidden>Admin</a>
      <a href="/logout?return_to=%2F">Sign out</a>
    </nav>
  </header>
  <main class="shell">
    <div class="hero">
      <div><p class="eyebrow">Private / self-service</p><h1 id="account-name">Your account</h1></div>
      <div class="role-card"><span>Permission level</span><strong id="account-role">—</strong></div>
    </div>
    <div class="layout">
      <div class="rail">
        <section>
          <h2>Display name</h2>
          <p class="section-note">Your local name for conversations and attribution. It does not alter an external profile.</p>
          <form id="name-form" class="name-form">
            <label for="display-name">Local account name</label>
            <input id="display-name" name="displayName" maxlength="200" autocomplete="name" required>
            <div class="button-row"><button class="button" type="submit">Save name</button></div>
          </form>
        </section>
        <section>
          <h2>Connected channels</h2>
          <p class="section-note">Verified connections are intentionally redacted here.</p>
          <ul id="channels" class="ledger"></ul>
          <p id="channels-empty" class="empty" hidden>No connected channels.</p>
        </section>
        <aside class="security-note"><strong>Authority stays separate</strong>Your role, account status, channel ownership, and brain access grants can only be changed by an Admin.</aside>
      </div>
      <div>
        <section>
          <h2>Passkeys</h2>
          <p class="section-note">Add a discoverable passkey or retire an old one. Your final passkey is protected from revocation.</p>
          <ul id="passkeys" class="ledger"></ul>
          <div class="button-row"><button id="add-passkey" class="button secondary" type="button">Add passkey</button></div>
        </section>
        <section>
          <h2>Signed-in sessions</h2>
          <p class="section-note">End another browser session, or sign out everywhere and authenticate again.</p>
          <ul id="sessions" class="ledger"></ul>
          <div class="button-row">
            <button id="revoke-others" class="button secondary" type="button">End other sessions</button>
            <button id="revoke-all" class="button danger" type="button">Sign out everywhere</button>
          </div>
        </section>
        <p id="status" class="status" role="status" aria-live="polite"></p>
      </div>
    </div>
  </main>
  <script>
    const state = { account: null };
    const byId = (id) => document.getElementById(id);
    const status = byId("status");

    function setStatus(message, error = false) {
      status.textContent = message;
      status.classList.toggle("error", error);
    }

    async function request(path, options = {}) {
      const response = await fetch(path, {
        credentials: "same-origin",
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Account request failed");
      return body;
    }

    function dateLabel(value, milliseconds = false) {
      const date = new Date(milliseconds ? value : value * 1000);
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
    }

    function actionButton(label, className, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button " + className;
      button.textContent = label;
      button.addEventListener("click", action);
      return button;
    }

    function ledgerItem(title, meta, action, current = false) {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      const heading = document.createElement("span");
      heading.className = "item-title";
      heading.textContent = title;
      if (current) {
        const badge = document.createElement("span");
        badge.className = "current";
        badge.textContent = "This session";
        heading.append(badge);
      }
      const detail = document.createElement("span");
      detail.className = "item-meta";
      detail.textContent = meta;
      copy.append(heading, detail);
      item.append(copy);
      if (action) item.append(action);
      return item;
    }

    function render(account) {
      state.account = account;
      byId("account-name").textContent = account.displayName;
      byId("account-role").textContent = account.role;
      byId("display-name").value = account.displayName;
      byId("chat-link").hidden = account.role === "public";
      byId("admin-link").hidden = account.role !== "admin";

      const channels = byId("channels");
      channels.replaceChildren(...account.connectedChannels.map((channel) =>
        ledgerItem(channel.label, channel.type + " · verified " + dateLabel(channel.verifiedAt, true))
      ));
      byId("channels-empty").hidden = account.connectedChannels.length > 0;

      const passkeys = byId("passkeys");
      passkeys.replaceChildren(...account.passkeys.map((passkey, index) => {
        const revoke = account.passkeys.length > 1
          ? actionButton("Revoke", "danger", () => revokePasskey(passkey.id))
          : null;
        const details = [
          passkey.credentialBackedUp ? "Synced credential" : "Device credential",
          "added " + dateLabel(passkey.createdAt, true),
        ].join(" · ");
        return ledgerItem("Passkey " + (index + 1), details, revoke);
      }));

      const sessions = byId("sessions");
      sessions.replaceChildren(...account.sessions.map((session) => {
        const end = session.current ? null : actionButton("End", "danger", () => revokeSession(session.id));
        return ledgerItem("Browser session", "Started " + dateLabel(session.createdAt), end, session.current);
      }));
      byId("revoke-others").disabled = account.sessions.every((session) => session.current);
    }

    async function mutate(body) {
      const result = await request("/auth/account/mutations", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (result.account) render(result.account);
      return result;
    }

    async function revokePasskey(credentialId) {
      if (!confirm("Revoke this passkey? You will not be able to use it again.")) return;
      try {
        setStatus("Revoking passkey…");
        await mutate({ action: "revokePasskey", confirmation: "revokePasskey", credentialId });
        setStatus("Passkey revoked.");
      } catch (error) { setStatus(error.message, true); }
    }

    async function revokeSession(sessionId) {
      if (!confirm("End this browser session?")) return;
      try {
        setStatus("Ending session…");
        await mutate({ action: "revokeSession", confirmation: "revokeSession", sessionId });
        setStatus("Session ended.");
      } catch (error) { setStatus(error.message, true); }
    }

    byId("name-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("Saving…");
        await mutate({
          action: "updateDisplayName",
          confirmation: "updateDisplayName",
          displayName: byId("display-name").value,
        });
        setStatus("Display name updated.");
      } catch (error) { setStatus(error.message, true); }
    });

    byId("revoke-others").addEventListener("click", async () => {
      if (!confirm("End every other browser session?")) return;
      try {
        setStatus("Ending other sessions…");
        const result = await mutate({ action: "revokeOtherSessions", confirmation: "revokeOtherSessions" });
        setStatus(result.revoked.sessions + " other session(s) ended.");
      } catch (error) { setStatus(error.message, true); }
    });

    byId("revoke-all").addEventListener("click", async () => {
      if (!confirm("Sign out every session, including this one? You will need your passkey to return.")) return;
      try {
        setStatus("Signing out everywhere…");
        await mutate({ action: "revokeAllSessions", confirmation: "revokeAllSessions" });
        location.assign("/login?return_to=%2Faccount");
      } catch (error) { setStatus(error.message, true); }
    });

    function decodeBase64Url(value) {
      const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      return bytes.buffer;
    }

    function encodeBase64Url(value) {
      const bytes = new Uint8Array(value);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
    }

    byId("add-passkey").addEventListener("click", async () => {
      try {
        if (!window.PublicKeyCredential) throw new Error("This browser does not support passkeys");
        setStatus("Waiting for your authenticator…");
        const options = await request("/auth/account/passkeys/options", { method: "POST", body: "{}" });
        options.challenge = decodeBase64Url(options.challenge);
        options.user.id = decodeBase64Url(options.user.id);
        options.excludeCredentials = (options.excludeCredentials || []).map((credential) => ({
          ...credential,
          id: decodeBase64Url(credential.id),
        }));
        const credential = await navigator.credentials.create({ publicKey: options });
        if (!credential) throw new Error("Passkey registration was cancelled");
        const response = credential.response;
        const payload = {
          id: credential.id,
          rawId: encodeBase64Url(credential.rawId),
          type: credential.type,
          ...(credential.authenticatorAttachment ? { authenticatorAttachment: credential.authenticatorAttachment } : {}),
          clientExtensionResults: credential.getClientExtensionResults(),
          response: {
            clientDataJSON: encodeBase64Url(response.clientDataJSON),
            attestationObject: encodeBase64Url(response.attestationObject),
            transports: typeof response.getTransports === "function" ? response.getTransports() : [],
          },
        };
        const result = await request("/auth/account/passkeys/verify", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        render(result.account);
        setStatus("Passkey added.");
      } catch (error) { setStatus(error.message, true); }
    });

    request("/auth/account")
      .then((result) => { render(result.account); setStatus(""); })
      .catch((error) => setStatus(error.message, true));
  </script>
</body>
</html>`;
}
