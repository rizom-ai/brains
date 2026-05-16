import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginTestHarness, expectSuccess } from "@brains/plugins/test";
import { Logger, LogLevel, z } from "@brains/utils";
import { OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL } from "@brains/operator-notifications";
import {
  AuthService,
  PasskeyStore,
  authServicePlugin,
  normalizeIssuer,
} from "../src";
import type { AuthServicePlugin } from "../src";

const setupRequiredToolDataSchema = z.object({
  status: z.literal("setup_required"),
  setupUrl: z.string(),
  expiresAt: z.number(),
});

const setupCompleteToolDataSchema = z.object({
  status: z.literal("complete"),
});

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-service-"));
  tempDirs.push(dir);
  return dir;
}

async function seedPasskeyCredential(storageDir: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await new PasskeyStore({ storageDir }).addCredential({
    id: "credential-id",
    public_key: Buffer.from("public-key").toString("base64url"),
    counter: 0,
    subject: "single-operator",
    user_name: "Operator",
    credential_device_type: "singleDevice",
    credential_backed_up: false,
    created_at: now,
    updated_at: now,
  });
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthService", () => {
  it("normalizes issuer origins", () => {
    expect(normalizeIssuer("https://brain.example.com/")).toBe(
      "https://brain.example.com",
    );
    expect(() => normalizeIssuer("https://brain.example.com/auth")).toThrow(
      "OAuth issuer must be an origin",
    );
  });

  it("generates and reuses an ES256 public JWKS key", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });

    const first = await service.getJwks();
    const secondService = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    const second = await secondService.getJwks();

    expect(first.keys).toHaveLength(1);
    expect(first.keys[0]).toMatchObject({
      kty: "EC",
      crv: "P-256",
      use: "sig",
      alg: "ES256",
    });
    expect(first.keys[0]?.["d"]).toBeUndefined();
    expect(second.keys[0]?.kid).toBe(first.keys[0]?.kid);

    const keyStats = await stat(join(storageDir, "oauth-signing-key.jwk"));
    expect(keyStats.mode & 0o777).toBe(0o600);
  });

  it("serves OAuth well-known metadata from request host", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
      trustedIssuers: ["https://brain.example.com"],
    });

    const response = await service.handleWellKnownRequest(
      new Request("http://127.0.0.1/.well-known/oauth-authorization-server", {
        headers: {
          host: "brain.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: "https://brain.example.com",
      authorization_endpoint: "https://brain.example.com/authorize",
      token_endpoint: "https://brain.example.com/token",
      registration_endpoint: "https://brain.example.com/register",
      jwks_uri: "https://brain.example.com/.well-known/jwks.json",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("rejects OAuth requests from untrusted forwarded hosts", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const response = await service.handleWellKnownRequest(
      new Request(
        "https://brain.example.com/.well-known/oauth-authorization-server",
        {
          headers: {
            host: "evil.example.com",
            "x-forwarded-proto": "https",
          },
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Untrusted OAuth issuer");
  });

  it("allows explicitly trusted OAuth preview hosts", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
      trustedIssuers: ["https://preview.brain.example.com"],
    });

    const response = await service.handleWellKnownRequest(
      new Request(
        "https://brain.example.com/.well-known/oauth-authorization-server",
        {
          headers: {
            host: "preview.brain.example.com",
            "x-forwarded-proto": "https",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: "https://preview.brain.example.com",
      authorization_endpoint: "https://preview.brain.example.com/authorize",
    });
  });

  it("allows localhost request issuers for localhost dev issuers", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });

    const response = await service.handleWellKnownRequest(
      new Request(
        "http://localhost:8080/.well-known/oauth-authorization-server",
        {
          headers: { host: "127.0.0.1:8080" },
        },
      ),
    );

    expect(response.status).toBe(200);
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: "http://127.0.0.1:8080",
      token_endpoint: "http://127.0.0.1:8080/token",
    });
  });

  it("serves setup page and registration options before passkey enrollment", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "http://localhost:8080",
    });

    await service.initialize();
    const setupUrl = service.getSetupUrl("http://localhost:8080");
    expect(setupUrl).toStartWith("http://localhost:8080/setup?token=setup_");

    const setupPage = await service.handleRequest(new Request(setupUrl ?? ""));
    expect(setupPage.status).toBe(200);
    const setupHtml = await setupPage.text();
    expect(setupHtml).toContain("Set up your brain passkey");

    const optionsResponse = await service.handleRequest(
      new Request(
        `http://localhost:8080/webauthn/register/options?setup_token=${encodeURIComponent(
          new URL(setupUrl ?? "").searchParams.get("token") ?? "",
        )}`,
        {
          method: "POST",
        },
      ),
    );
    expect(optionsResponse.status).toBe(200);
    const options = await optionsResponse.json();
    expect(options).toMatchObject({
      rp: { name: "Brain", id: "localhost" },
      user: { name: "Operator", displayName: "Operator" },
      attestation: "none",
    });
    expect(typeof options.challenge).toBe("string");
    expect(options.authenticatorSelection).toMatchObject({
      userVerification: "required",
    });
  });

  it("hides setup page without the one-shot setup token", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });
    await service.initialize();

    const pageResponse = await service.handleRequest(
      new Request("http://localhost:8080/setup"),
    );
    expect(pageResponse.status).toBe(404);

    const optionsResponse = await service.handleRequest(
      new Request("http://localhost:8080/webauthn/register/options", {
        method: "POST",
      }),
    );
    expect(optionsResponse.status).toBe(400);
    const error = await optionsResponse.json();
    expect(error).toMatchObject({
      error: "access_denied",
      error_description: "Invalid setup token",
    });
  });

  it("does not log token-bearing setup URLs for hosted issuers", async () => {
    const storageDir = await tempStorageDir();
    const logFile = join(storageDir, "auth.log");
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
      logger: Logger.createFresh({ level: LogLevel.WARN, logFile }),
    });

    await service.initialize();

    const log = await readFile(logFile, "utf8");
    expect(log).toContain("Passkey setup required");
    expect(log).not.toContain("/setup?token=");
    expect(log).not.toContain("setup_");
  });

  it("registers an anchor-visible tool to retrieve the active passkey setup URL", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness({ domain: "brain.example.com" });
    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
      }),
    );

    const tool = harness
      .getCapabilities()
      .tools.find((candidate) =>
        candidate.name.includes("get_passkey_setup_url"),
      );
    expect(tool).toBeDefined();
    expect(tool?.visibility).toBe("anchor");

    const response = await harness.executeTool(tool?.name ?? "", {});
    expectSuccess(response);
    const data = setupRequiredToolDataSchema.parse(response.data);

    expect(data.status).toBe("setup_required");
    expect(data.setupUrl).toStartWith(
      "https://brain.example.com/setup?token=setup_",
    );
    expect(typeof data.expiresAt).toBe("number");
  });

  it("requests a setup email notification when setup email is configured", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const notifications: unknown[] = [];

    harness.subscribe(
      OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL,
      async (message) => {
        notifications.push(message.payload);
        return { success: true, data: { status: "sent" } };
      },
    );

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );

    expect(notifications).toHaveLength(1);
    const notification = z
      .object({
        channel: z.literal("email"),
        to: z.literal("user@example.com"),
        subject: z.string(),
        text: z.string(),
        sensitivity: z.literal("secret"),
        dedupeKey: z.string(),
      })
      .parse(notifications[0]);

    expect(notification.subject).toContain("Set up your brain passkey");
    expect(notification.text).toContain(
      "https://brain.example.com/setup?token=setup_",
    );
    expect(notification.text).toContain("single-use");
    expect(notification.text).toContain("expires");
    expect(notification.dedupeKey).toBe(
      "auth-service:first-passkey:https://brain.example.com:user@example.com",
    );
  });

  it("does not request a setup email when setup email is not configured", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const notifications: unknown[] = [];

    harness.subscribe(
      OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL,
      async (message) => {
        notifications.push(message.payload);
        return { success: true, data: { status: "sent" } };
      },
    );

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
      }),
    );

    expect(notifications).toHaveLength(0);
  });

  it("does not request a setup email when a passkey already exists", async () => {
    const storageDir = await tempStorageDir();
    await seedPasskeyCredential(storageDir);
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const notifications: unknown[] = [];

    harness.subscribe(
      OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL,
      async (message) => {
        notifications.push(message.payload);
        return { success: true, data: { status: "sent" } };
      },
    );

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );

    expect(notifications).toHaveLength(0);
  });

  it("setup URL retrieval tool reports complete when a passkey exists", async () => {
    const storageDir = await tempStorageDir();
    await seedPasskeyCredential(storageDir);

    const harness = new PluginTestHarness({ domain: "brain.example.com" });
    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
      }),
    );

    const response = await harness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(response);
    const data = setupCompleteToolDataSchema.parse(response.data);

    expect(data).toEqual({ status: "complete" });
  });

  it("defaults passkey setup URLs to the local runtime issuer during local runs", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      localSiteUrl: "http://localhost:9090",
      preferLocalUrls: true,
    });
    await harness.installPlugin(authServicePlugin({ storageDir }));

    const response = await harness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(response);
    const data = setupRequiredToolDataSchema.parse(response.data);

    expect(data.setupUrl).toStartWith(
      "http://localhost:9090/setup?token=setup_",
    );

    const plugin = harness.getPlugin();
    const setupPage = await plugin
      .getService()
      .handleRequest(new Request(data.setupUrl));
    expect(setupPage.status).toBe(200);
  });

  it("keeps the public issuer during production runs", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      localSiteUrl: "http://localhost:9090",
      preferLocalUrls: false,
    });
    await harness.installPlugin(authServicePlugin({ storageDir }));

    const response = await harness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(response);
    const data = setupRequiredToolDataSchema.parse(response.data);

    expect(data.setupUrl).toStartWith(
      "https://brain.example.com/setup?token=setup_",
    );
  });

  it("keeps an explicit auth-service issuer override even during local runs", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      localSiteUrl: "http://localhost:9090",
      preferLocalUrls: true,
    });
    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
      }),
    );

    const response = await harness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(response);
    const data = setupRequiredToolDataSchema.parse(response.data);

    expect(data.setupUrl).toStartWith(
      "https://brain.example.com/setup?token=setup_",
    );
  });

  it("rejects passkey authentication options before setup", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });

    const response = await service.handleRequest(
      new Request("http://localhost:8080/webauthn/auth/options", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error).toMatchObject({
      error: "access_denied",
      error_description: "No passkey registered",
    });
  });

  it("registers and persists a public OAuth client", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });

    const response = await service.handleRequest(
      new Request("https://brain.example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
          client_name: "Claude Desktop",
          scope: "openid profile mcp offline_access",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const client = await response.json();
    expect(client).toMatchObject({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      client_name: "Claude Desktop",
      scope: "openid profile mcp offline_access",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    expect(client.client_id).toStartWith("oc_");
    expect(client.client_secret).toBeUndefined();

    const clientStats = await stat(join(storageDir, "oauth-clients.json"));
    expect(clientStats.mode & 0o777).toBe(0o600);

    const secondService = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    const persistedClient = await secondService.getRegisteredClient(
      client.client_id,
    );
    expect(persistedClient).toMatchObject({
      client_id: client.client_id,
      client_name: "Claude Desktop",
    });

    const store = JSON.parse(
      await readFile(join(storageDir, "oauth-clients.json"), "utf8"),
    ) as { clients: unknown[] };
    expect(store.clients).toHaveLength(1);
  });

  it("issues an authorization code and exchanges it for a bearer token", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const registerResponse = await service.handleRequest(
      new Request("https://brain.example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
          client_name: "Claude Desktop",
        }),
      }),
    );
    const client = await registerResponse.json();
    const verifier =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const challenge = await pkceChallenge(verifier);
    const authorizeUrl = new URL("https://brain.example.com/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", client.client_id);
    authorizeUrl.searchParams.set(
      "redirect_uri",
      "http://127.0.0.1:6274/oauth/callback",
    );
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("state", "state-123");
    authorizeUrl.searchParams.set("scope", "openid profile mcp");

    const session = await service.createOperatorSession();
    const pageResponse = await service.handleRequest(
      new Request(authorizeUrl.toString(), {
        headers: { cookie: session.cookie },
      }),
    );
    expect(pageResponse.status).toBe(200);
    const page = await pageResponse.text();
    expect(page).toContain("Authorize Claude Desktop");
    expect(page).toContain("MCP access");
    expect(page).toContain(
      "Use Model Context Protocol tools exposed by this brain",
    );
    expect(page).toContain("Basic profile");
    expect(page).not.toContain("temporary development screen");
    const approvalToken = page.match(
      /name="approval_token" value="([^"]+)"/,
    )?.[1];
    expect(approvalToken).toStartWith("oat_");

    const approveParams = new URLSearchParams(authorizeUrl.searchParams);
    approveParams.set("approval_token", approvalToken ?? "");
    const approveResponse = await service.handleRequest(
      new Request("https://brain.example.com/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: session.cookie,
        },
        body: approveParams.toString(),
      }),
    );
    expect(approveResponse.status).toBe(302);
    const redirect = new URL(approveResponse.headers.get("location") ?? "");
    expect(redirect.origin + redirect.pathname).toBe(
      "http://127.0.0.1:6274/oauth/callback",
    );
    expect(redirect.searchParams.get("state")).toBe("state-123");
    const code = redirect.searchParams.get("code");
    expect(code).toStartWith("ocd_");

    const tokenResponse = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client.client_id,
          redirect_uri: "http://127.0.0.1:6274/oauth/callback",
          code: code ?? "",
          code_verifier: verifier,
        }).toString(),
      }),
    );

    expect(tokenResponse.status).toBe(200);
    const token = await tokenResponse.json();
    expect(token).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      scope: "openid profile mcp",
    });
    expect(token.access_token.split(".")).toHaveLength(3);
    expect(token.refresh_token).toStartWith("ort_");

    const verified = await service.verifyBearerToken(
      new Request("https://brain.example.com/mcp", {
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
      { issuer: "https://brain.example.com", audience: client.client_id },
    );
    expect(verified).toMatchObject({
      subject: "single-operator",
      issuer: "https://brain.example.com",
      audience: client.client_id,
      scope: ["openid", "profile", "mcp"],
    });

    const verifiedFromRequestIssuer = await service.verifyBearerToken(
      new Request("https://brain.example.com/mcp", {
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
      { audience: client.client_id },
    );
    expect(verifiedFromRequestIssuer).toMatchObject({
      issuer: "https://brain.example.com",
      audience: client.client_id,
    });

    let untrustedIssuerError: unknown;
    try {
      await service.verifyBearerToken(
        new Request("https://brain.example.com/mcp", {
          headers: {
            authorization: `Bearer ${token.access_token}`,
            host: "evil.example.com",
            "x-forwarded-proto": "https",
          },
        }),
        { audience: client.client_id },
      );
    } catch (error) {
      untrustedIssuerError = error;
    }
    expect(untrustedIssuerError).toBeInstanceOf(Error);

    let verifyError: unknown;
    try {
      await service.verifyBearerToken(
        new Request("https://brain.example.com/mcp", {
          headers: { authorization: `Bearer ${token.access_token}` },
        }),
        { issuer: "https://brain.example.com", audience: "wrong-audience" },
      );
    } catch (error) {
      verifyError = error;
    }
    expect(verifyError).toBeInstanceOf(Error);

    const refreshResponse = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: token.refresh_token,
        }).toString(),
      }),
    );
    expect(refreshResponse.status).toBe(200);
    const refreshed = await refreshResponse.json();
    expect(refreshed).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      scope: "openid profile mcp",
    });
    expect(refreshed.access_token.split(".")).toHaveLength(3);
    expect(refreshed.refresh_token).toStartWith("ort_");
    expect(refreshed.refresh_token).not.toBe(token.refresh_token);

    const reusedRefreshResponse = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: token.refresh_token,
        }).toString(),
      }),
    );
    expect(reusedRefreshResponse.status).toBe(400);

    const revokeResponse = await service.handleRequest(
      new Request("https://brain.example.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: client.client_id,
          token: refreshed.refresh_token,
        }).toString(),
      }),
    );
    expect(revokeResponse.status).toBe(200);

    const revokedRefreshResponse = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: refreshed.refresh_token,
        }).toString(),
      }),
    );
    expect(revokedRefreshResponse.status).toBe(400);
  });

  it("allows MCP Inspector loopback redirect callback variation", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });
    const client = await service.registerClient({
      redirect_uris: ["http://localhost:6274/oauth/callback/debug"],
      client_name: "MCP Inspector",
      scope: "mcp",
    });
    const verifier =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const challenge = await pkceChallenge(verifier);
    const session = await service.createOperatorSession();
    const authorizeUrl = new URL("http://localhost:8080/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", client.client_id);
    authorizeUrl.searchParams.set(
      "redirect_uri",
      "http://localhost:6274/oauth/callback",
    );
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("resource", "http://localhost:8080/");

    const pageResponse = await service.handleRequest(
      new Request(authorizeUrl.toString(), {
        headers: { cookie: session.cookie },
      }),
    );
    const page = await pageResponse.text();
    expect(page).toContain("MCP access");
    expect(page).not.toContain("Sign-in only");
    const approvalToken = page.match(
      /name="approval_token" value="([^"]+)"/,
    )?.[1];
    expect(approvalToken).toStartWith("oat_");

    const approveParams = new URLSearchParams(authorizeUrl.searchParams);
    approveParams.set("approval_token", approvalToken ?? "");
    const approveResponse = await service.handleRequest(
      new Request("http://localhost:8080/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: session.cookie,
        },
        body: approveParams.toString(),
      }),
    );
    const redirect = new URL(approveResponse.headers.get("location") ?? "");
    const code = redirect.searchParams.get("code");

    const tokenResponse = await service.handleRequest(
      new Request("http://localhost:8080/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client.client_id,
          redirect_uri: "http://127.0.0.1:6274/oauth/callback",
          code: code ?? "",
          code_verifier: verifier,
        }).toString(),
      }),
    );

    expect(tokenResponse.status).toBe(200);
    const token = await tokenResponse.json();
    expect(token).toMatchObject({ token_type: "Bearer", scope: "mcp" });
  });

  it("logs out and revokes the current operator session", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const session = await service.createOperatorSession();
    const request = new Request("https://brain.example.com/dashboard", {
      headers: { cookie: session.cookie },
    });

    const beforeLogout = await service.getOperatorSession(request);
    expect(beforeLogout).toMatchObject({
      subject: "single-operator",
    });

    const response = await service.handleRequest(
      new Request("https://brain.example.com/logout?return_to=/dashboard", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await service.getOperatorSession(request)).toBeUndefined();
  });

  it("sanitizes logout return_to", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const response = await service.handleRequest(
      new Request(
        "https://brain.example.com/logout?return_to=https://evil.example",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  it("requires a page-issued approval token before approving authorization", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const client = await service.registerClient({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      client_name: "Claude Desktop",
    });
    const authorizeParams = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "http://127.0.0.1:6274/oauth/callback",
      code_challenge: await pkceChallenge("verifier"),
      code_challenge_method: "S256",
    });
    const session = await service.createOperatorSession();

    const missingTokenResponse = await service.handleRequest(
      new Request("https://brain.example.com/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: session.cookie,
        },
        body: authorizeParams.toString(),
      }),
    );
    expect(missingTokenResponse.status).toBe(400);
    expect(await missingTokenResponse.text()).toContain(
      "Invalid authorization approval token",
    );

    const pageResponse = await service.handleRequest(
      new Request(`https://brain.example.com/authorize?${authorizeParams}`, {
        headers: { cookie: session.cookie },
      }),
    );
    const page = await pageResponse.text();
    const approvalToken = page.match(
      /name="approval_token" value="([^"]+)"/,
    )?.[1];
    expect(approvalToken).toStartWith("oat_");

    const approvedParams = new URLSearchParams(authorizeParams);
    approvedParams.set("approval_token", approvalToken ?? "");
    const approveResponse = await service.handleRequest(
      new Request("https://brain.example.com/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: session.cookie,
        },
        body: approvedParams.toString(),
      }),
    );
    expect(approveResponse.status).toBe(302);

    const reuseResponse = await service.handleRequest(
      new Request("https://brain.example.com/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: session.cookie,
        },
        body: approvedParams.toString(),
      }),
    );
    expect(reuseResponse.status).toBe(400);
  });

  it("requires an operator session before showing the authorize page", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const client = await service.registerClient({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      client_name: "Claude Desktop",
    });
    const authorizeUrl = new URL("https://brain.example.com/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", client.client_id);
    authorizeUrl.searchParams.set(
      "redirect_uri",
      "http://127.0.0.1:6274/oauth/callback",
    );
    authorizeUrl.searchParams.set(
      "code_challenge",
      await pkceChallenge("verifier"),
    );
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await service.handleRequest(
      new Request(authorizeUrl.toString()),
    );

    expect(response.status).toBe(401);
    const html = await response.text();
    expect(html).toContain("Operator login required");
  });

  it("rejects invalid PKCE verifiers", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const client = await service.registerClient({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
    });
    const challenge = await pkceChallenge("correct-verifier");
    const code = await service["authCodeStore"].createCode({
      clientId: client.client_id,
      redirectUri: "http://127.0.0.1:6274/oauth/callback",
      codeChallenge: challenge,
      subject: "single-operator",
    });

    const response = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client.client_id,
          redirect_uri: "http://127.0.0.1:6274/oauth/callback",
          code: code.code,
          code_verifier: "wrong-verifier",
        }).toString(),
      }),
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error).toMatchObject({ error: "invalid_grant" });
  });

  it("rejects invalid client metadata", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const response = await service.handleRequest(
      new Request("https://brain.example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["not a url"] }),
      }),
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error).toMatchObject({
      error: "invalid_client_metadata",
    });
  });

  it("serves MCP protected-resource metadata", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const response = await service.handleWellKnownRequest(
      new Request(
        "https://brain.example.com/.well-known/oauth-protected-resource",
      ),
    );

    expect(response.status).toBe(200);
    const metadata = await response.json();
    expect(metadata).toEqual({
      resource: "https://brain.example.com",
      authorization_servers: ["https://brain.example.com"],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["ES256"],
      scopes_supported: ["mcp"],
    });
  });

  it("allows browser CORS for OAuth machine endpoints", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });

    const metadataResponse = await service.handleRequest(
      new Request(
        "http://localhost:8080/.well-known/oauth-protected-resource",
        {
          headers: { Origin: "https://inspector.modelcontextprotocol.io" },
        },
      ),
    );

    expect(metadataResponse.status).toBe(200);
    expect(metadataResponse.headers.get("access-control-allow-origin")).toBe(
      "*",
    );
    expect(
      metadataResponse.headers.get("access-control-allow-private-network"),
    ).toBe("true");

    const preflightResponse = await service.handleRequest(
      new Request("http://localhost:8080/register", {
        method: "OPTIONS",
        headers: {
          Origin: "https://inspector.modelcontextprotocol.io",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
          "Access-Control-Request-Private-Network": "true",
        },
      }),
    );

    expect(preflightResponse.status).toBe(204);
    expect(preflightResponse.headers.get("access-control-allow-origin")).toBe(
      "*",
    );
    expect(preflightResponse.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(
      preflightResponse.headers.get("access-control-allow-headers"),
    ).toContain("Content-Type");
    expect(
      preflightResponse.headers.get("access-control-allow-headers"),
    ).toContain("MCP-Protocol-Version");
  });
});
