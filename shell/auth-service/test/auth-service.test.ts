import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginTestHarness, expectSuccess } from "@brains/plugins/test";
import { PermissionService } from "@brains/templates";
import { Logger, LogLevel } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { NOTIFICATIONS_SEND } from "@brains/notifications";
import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  createExternalActorId,
} from "@brains/contracts";
import {
  AuthService,
  authServicePlugin,
  normalizeIssuer,
  reinitializeAuthAccessStorage,
} from "../src";
import { resolveAuthStorageDir } from "../src/auth-service-plugin";
import type { AuthServicePlugin } from "../src";
import { seedRuntimePasskeyCredential } from "./runtime-passkey-fixture";

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

async function readyAuthPlugin(
  harness: PluginTestHarness<AuthServicePlugin>,
): Promise<void> {
  await harness.getPlugin().ready();
}

async function seedPasskeyCredential(storageDir: string): Promise<void> {
  await seedRuntimePasskeyCredential(storageDir);
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

  it("keeps default auth storage outside the synchronized content tree", () => {
    expect(resolveAuthStorageDir(undefined)).toBe(join(".", "data", "auth"));
    expect(resolveAuthStorageDir("/srv/brain-auth")).toBe("/srv/brain-auth");
  });

  it("joins repeated shutdown calls", async () => {
    const service = new AuthService({ storageDir: await tempStorageDir() });

    const firstClose = service.close();
    const secondClose = service.close();

    expect(secondClose).toBe(firstClose);
    await firstClose;
  });

  it("generates and reuses public JWKS keys for OAuth and A2A", async () => {
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

    expect(first.keys).toHaveLength(2);

    const oauthKey = first.keys.find((key) => key.alg === "ES256");
    expect(oauthKey).toMatchObject({
      kty: "EC",
      crv: "P-256",
      use: "sig",
      alg: "ES256",
    });
    expect(oauthKey?.["d"]).toBeUndefined();

    const a2aKey = first.keys.find((key) => key.alg === "EdDSA");
    expect(a2aKey).toMatchObject({
      kty: "OKP",
      crv: "Ed25519",
      use: "sig",
      alg: "EdDSA",
    });
    expect(a2aKey?.["d"]).toBeUndefined();

    expect(second.keys.find((key) => key.alg === "ES256")?.kid).toBe(
      oauthKey?.kid,
    );
    expect(second.keys.find((key) => key.alg === "EdDSA")?.kid).toBe(
      a2aKey?.kid,
    );

    const authDatabaseStats = await stat(join(storageDir, "auth.db"));
    expect(authDatabaseStats.mode & 0o777).toBe(0o600);
  });

  it("returns an A2A signing key id rooted at the issuer JWKS", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });

    const signingKey = await service.getA2ASigningKey();
    const jwks = await service.getJwks();
    const publicA2AKey = jwks.keys.find((key) => key.alg === "EdDSA");

    expect(signingKey.keyId).toBe(
      `https://brain.example.com/.well-known/jwks.json#${publicA2AKey?.kid}`,
    );
    expect(signingKey.privateJwk).toMatchObject({
      kty: "OKP",
      crv: "Ed25519",
      alg: "EdDSA",
      kid: publicA2AKey?.kid,
    });
    expect(signingKey.privateJwk.d).toBeString();
  });

  it("persists A2A peer trust grants in runtime auth storage", async () => {
    const storageDir = await tempStorageDir();
    const first = new AuthService({ storageDir });

    await first.grantA2APeerTrust({
      domain: "Remote.Example",
      keyFingerprint: "fingerprint-1",
      grantedLevel: "trusted",
    });

    const second = new AuthService({ storageDir });
    const grant = await second.getA2APeerTrust("remote.example");
    expect(grant).toEqual({
      domain: "remote.example",
      keyFingerprint: "fingerprint-1",
      grantedLevel: "trusted",
    });
  });

  it("does not allow A2A peer trust grants to confer admin permission", async () => {
    const service = new AuthService({ storageDir: await tempStorageDir() });

    let caught: unknown;
    try {
      await service.grantA2APeerTrust({
        domain: "remote.example",
        keyFingerprint: "fingerprint-1",
        grantedLevel: "admin",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toHaveProperty(
      "message",
      "A2A peer trust grants must be trusted or public",
    );
  });

  it("revokes A2A peer trust grants from runtime auth storage", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({ storageDir });

    await service.grantA2APeerTrust({
      domain: "remote.example",
      keyFingerprint: "fingerprint-1",
      grantedLevel: "trusted",
    });
    await service.revokeA2APeerTrust("remote.example");

    const reloaded = new AuthService({ storageDir });
    expect(await reloaded.getA2APeerTrust("remote.example")).toBeUndefined();
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
      user: { name: "Admin", displayName: "Admin" },
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

  it("keeps first-passkey setup tokens valid for 24 hours by default", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const before = Math.floor(Date.now() / 1000);
    await service.initialize();
    const setup = await service.getPasskeySetupRequired();
    const after = Math.floor(Date.now() / 1000);

    expect(setup?.expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60);
    expect(setup?.expiresAt).toBeLessThanOrEqual(after + 24 * 60 * 60);
  });

  it("allows configuring the first-passkey setup token lifetime", async () => {
    const harness = new PluginTestHarness({ domain: "brain.example.com" });

    const before = Math.floor(Date.now() / 1000);
    await harness.installPlugin(
      authServicePlugin({
        storageDir: await tempStorageDir(),
        issuer: "https://brain.example.com",
        setupTokenTtlSeconds: 2 * 60 * 60,
      }),
    );
    const response = await harness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    const after = Math.floor(Date.now() / 1000);

    expectSuccess(response);
    const setup = setupRequiredToolDataSchema.parse(response.data);
    expect(setup.expiresAt).toBeGreaterThanOrEqual(before + 2 * 60 * 60);
    expect(setup.expiresAt).toBeLessThanOrEqual(after + 2 * 60 * 60);
  });

  it("projects the configured Anchor flavor and CMS profile through the plugin", async () => {
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
    });
    await harness.installPlugin(
      authServicePlugin({
        anchor: "team",
        storageDir: await tempStorageDir(),
        issuer: "https://brain.example.com",
      }),
    );
    const service = harness.getPlugin().getService();
    await service.createAuthSession();

    expect(await service.getBrainAnchor()).toMatchObject({
      kind: "collective",
      configuredKind: "team",
      displayName: "Test Owner",
      profileEntityId: "anchor-profile/anchor-profile",
    });
    expect((await service.listUsers())[0]?.isAnchor).toBe(false);
  });

  it("seeds exact interface principals once and projects DB state into permissions", async () => {
    const storageDir = await tempStorageDir();
    const firstHarness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logger: Logger.createFresh({ level: LogLevel.ERROR }),
    });
    firstHarness.setPermissionService(
      new PermissionService({
        admins: ["discord:first-admin"],
        trusted: ["discord:first-trusted"],
        anchors: ["discord:first-owner"],
      }),
    );
    await firstHarness.installPlugin(
      authServicePlugin({ storageDir, issuer: "https://brain.example.com" }),
    );

    expect(
      firstHarness
        .getPermissionService()
        .determineUserLevel("discord", "first-admin"),
    ).toBe("admin");
    expect(
      firstHarness
        .getPermissionService()
        .determineUserLevel("discord", "first-trusted"),
    ).toBe("trusted");
    expect(
      firstHarness.getPermissionService().isAnchor("discord", "first-owner"),
    ).toBe(true);
    const firstService = firstHarness.getPlugin().getService();
    const runtimeGrant = await firstService.upsertInterfaceGrant({
      interfaceType: "discord",
      subject: "runtime-trusted",
      label: "Runtime trusted",
      permissionLevel: "trusted",
    });
    expect(
      firstHarness
        .getPermissionService()
        .determineUserLevel("discord", "runtime-trusted"),
    ).toBe("trusted");
    await firstService.revokeInterfaceGrant(runtimeGrant.id);
    expect(
      firstHarness
        .getPermissionService()
        .determineUserLevel("discord", "runtime-trusted"),
    ).toBe("public");
    await firstService.close();

    const restartHarness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logger: Logger.createFresh({ level: LogLevel.ERROR }),
    });
    restartHarness.setPermissionService(
      new PermissionService({ admins: ["discord:replacement"] }),
    );
    await restartHarness.installPlugin(
      authServicePlugin({ storageDir, issuer: "https://brain.example.com" }),
    );

    expect(
      restartHarness
        .getPermissionService()
        .determineUserLevel("discord", "first-admin"),
    ).toBe("admin");
    expect(
      restartHarness
        .getPermissionService()
        .determineUserLevel("discord", "replacement"),
    ).toBe("public");
    await restartHarness.getPlugin().getService().close();
  });

  it("reinitializes access from config without deleting users and revokes sessions", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await service.initializeConfiguredInterfacePrincipals({
      admins: ["discord:old-admin"],
      trusted: [],
      anchors: [],
    });
    const session = await service.createAuthSession();
    const userCount = (await service.listUsers()).length;
    await service.close();

    const { state } = await reinitializeAuthAccessStorage(storageDir, {
      admins: ["discord:new-admin"],
      trusted: ["discord:new-trusted"],
      anchors: ["discord:new-owner"],
    });

    const reopened = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    expect(
      await reopened.resolveInterfacePrincipal("discord", "old-admin"),
    ).toBeUndefined();
    expect(
      await reopened.resolveInterfacePrincipal("discord", "new-admin"),
    ).toEqual({ permissionLevel: "admin", isAnchor: false });
    expect(state.grants.map((grant) => grant.permissionLevel).sort()).toEqual([
      "admin",
      "trusted",
    ]);
    expect(state.anchors).toHaveLength(1);
    expect(
      await reopened.resolveSession(
        new Request("https://brain.example.com/admin", {
          headers: { cookie: session.cookie },
        }),
      ),
    ).toBeUndefined();
    expect((await reopened.listUsers()).length).toBe(userCount);
    expect(await reopened.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "auth.access.reinitialized" }),
      ]),
    );
    await reopened.close();
  });

  it("reprojects persisted ownership when brain configuration changes", async () => {
    const storageDir = await tempStorageDir();
    const collective = new AuthService({ storageDir, anchor: "team" });
    await collective.initialize();
    await collective.createAuthSession();
    expect((await collective.getBrainAnchor()).kind).toBe("collective");
    await collective.close();

    const personal = new AuthService({ storageDir, anchor: "person" });
    await personal.initialize();
    expect(await personal.getBrainAnchor()).toMatchObject({
      kind: "person",
      configuredKind: "person",
      profileEntityId: "anchor-profile/anchor-profile",
    });
    expect((await personal.listUsers())[0]?.isAnchor).toBe(true);
    await personal.close();
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

  it("registers an Admin-only tool to retrieve the active passkey setup URL", async () => {
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
    expect(tool?.visibility).toBe("admin");
    expect(tool?.sideEffects).toBe("none");

    const response = await harness.executeTool(tool?.name ?? "", {});
    expectSuccess(response);
    const data = setupRequiredToolDataSchema.parse(response.data);

    expect(data.status).toBe("setup_required");
    expect(data.setupUrl).toStartWith(
      "https://brain.example.com/setup?token=setup_",
    );
    expect(typeof data.expiresAt).toBe("number");
  });

  it("does not expose auth administration as model-visible tools", async () => {
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
    });
    await harness.installPlugin(
      authServicePlugin({
        storageDir: await tempStorageDir(),
        issuer: "https://brain.example.com",
      }),
    );

    const toolNames = harness.getCapabilities().tools.map((tool) => tool.name);
    expect(toolNames).not.toContain("auth-service_user_list");
    expect(toolNames).not.toContain("auth-service_user_create");
    expect(toolNames).not.toContain("auth-service_user_update_role");
    expect(toolNames).not.toContain("auth-service_user_suspend");
    expect(toolNames).not.toContain("auth-service_user_attach_identity");
    expect(toolNames).not.toContain("auth-service_user_detach_identity");
    expect(toolNames).not.toContain(
      "auth-service_user_start_passkey_registration",
    );
    expect(toolNames).not.toContain("auth-service_user_revoke_passkey");
  });

  it("prepares redacted email and Discord delivery claims for targeted setup", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const emailUser = await service.createUser({
      displayName: "Email Invitee",
      role: "trusted",
      status: "invited",
    });
    const discordUser = await service.createUser({
      displayName: "Discord Invitee",
      role: "trusted",
      status: "invited",
    });

    const emailSetup = await service.startPasskeyRegistrationForUser(
      emailUser.userId,
      { actorUserId: emailUser.userId },
      { type: "email", subject: "invitee@example.com" },
    );
    const discordSetup = await service.startPasskeyRegistrationForUser(
      discordUser.userId,
      { actorUserId: emailUser.userId },
      {
        type: "discord",
        subject: "1442828818493735015",
        label: "@invitee",
      },
    );
    const emailRetry = await service.startPasskeyRegistrationForUser(
      emailUser.userId,
      { actorUserId: emailUser.userId },
    );

    expect(emailSetup.setupUrl).not.toContain("invitee@example.com");
    expect(emailSetup.delivery).toEqual({
      type: "email",
      label: "Email address",
    });
    expect(emailRetry.delivery).toEqual(emailSetup.delivery);
    expect(discordSetup.setupUrl).not.toContain("1442828818493735015");
    expect(discordSetup.delivery).toEqual({
      type: "discord",
      label: "@invitee",
    });
    const emailIdentities = await service.listUserIdentities(emailUser.userId);
    expect(emailIdentities).toEqual([
      expect.objectContaining({
        type: "email",
        label: "invitee@example.com",
      }),
    ]);
    expect(emailIdentities[0]).not.toHaveProperty("verifiedAt");
    const discordIdentities = await service.listUserIdentities(
      discordUser.userId,
    );
    expect(discordIdentities).toEqual([
      expect.objectContaining({
        type: "discord",
        label: "@invitee",
      }),
    ]);
    expect(discordIdentities[0]).not.toHaveProperty("verifiedAt");
    const auditJson = JSON.stringify(await service.listAuditEvents());
    expect(auditJson).not.toContain("invitee@example.com");
    expect(auditJson).not.toContain("1442828818493735015");
    expect(auditJson).toContain('"deliveryType":"email"');
    expect(auditJson).toContain('"deliveryType":"discord"');

    const userWithoutDelivery = await service.createUser({
      displayName: "Missing Delivery",
      role: "trusted",
      status: "invited",
    });
    const missingDeliveryWasRejected = await service
      .startPasskeyRegistrationForUser(userWithoutDelivery.userId)
      .then(
        () => false,
        (error: unknown) =>
          error instanceof Error &&
          error.message ===
            "A confirmed email or Discord delivery channel is required",
      );
    expect(missingDeliveryWasRejected).toBe(true);
    await service.close();
  });

  it("binds the delivered channel once when targeted setup is claimed", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const user = await service.createUser({
      displayName: "Claiming Invitee",
      role: "trusted",
      status: "invited",
    });
    await service.startPasskeyRegistrationForUser(
      user.userId,
      { actorUserId: user.userId },
      { type: "email", subject: "claiming@example.com" },
    );
    const registration = await service.startPasskeyRegistrationForUser(
      user.userId,
      { actorUserId: user.userId },
    );
    let verificationCount = 0;
    const passkeyService = service["runtime"].passkeyService as unknown as {
      verifyRegistrationResponse: () => Promise<{
        verified: boolean;
        subject: string;
      }>;
    };
    passkeyService.verifyRegistrationResponse = async (): Promise<{
      verified: boolean;
      subject: string;
    }> => {
      verificationCount += 1;
      return { verified: true, subject: user.userId };
    };
    const token = new URL(registration.setupUrl).searchParams.get("token");
    if (!token) throw new Error("Expected targeted setup token");
    const request = (): Request =>
      new Request(
        `https://brain.example.com/webauthn/register/verify?setup_token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );

    const claimed = await service.handleRequest(request());
    const replayed = await service.handleRequest(request());

    expect(claimed.status).toBe(200);
    expect(replayed.status).toBe(400);
    expect(verificationCount).toBe(1);
    expect(
      (await service.listUsers()).find((item) => item.userId === user.userId),
    ).toMatchObject({
      status: "active",
    });
    expect(await service.listUserIdentities(user.userId)).toEqual([
      expect.objectContaining({
        type: "email",
        label: "claiming@example.com",
        verifiedAt: expect.any(Number),
        evidence: expect.arrayContaining([
          expect.objectContaining({
            sourceKind: "provider",
            assurance: "verified",
            verifiedAt: expect.any(Number),
          }),
        ]),
      }),
    ]);
    const auditJson = JSON.stringify(await service.listAuditEvents());
    expect(auditJson).toContain("auth.identity.delivery_bound");
    expect(auditJson).not.toContain("claiming@example.com");
    await service.close();
  });

  it("resolves private canonical identities through the internal runtime channel", async () => {
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
    });
    await harness.installPlugin(
      authServicePlugin({
        storageDir: await tempStorageDir(),
        issuer: "https://brain.example.com",
      }),
    );
    const service = harness.getPlugin().getService();
    const user = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    await service.attachIdentity({
      userId: user.userId,
      type: "discord",
      subject: "123",
      verifiedAt: Date.now(),
    });

    const response = await harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: AUTH_PRINCIPAL_RESOLVE_CHANNEL,
        sender: "test",
        payload: {
          actor: {
            kind: "external",
            externalActorId: createExternalActorId("discord", "123"),
          },
        },
      });

    expect(response).toEqual({
      success: true,
      data: {
        principal: {
          userId: user.userId,
          canonicalId: user.canonicalId,
          displayName: "Mira",
        },
      },
    });
  });

  it("requests a setup email notification when setup email is configured", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const notifications: unknown[] = [];

    harness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      notifications.push(message.payload);
      return { success: true, data: { status: "sent" } };
    });

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: {
          to: "user@example.com",
          subject: "Welcome to Rover — set up your passkey",
          body: [
            "Hi,",
            "",
            "Your Rover is ready.",
            "",
            "Set up your passkey:",
            "{{setupUrl}}",
            "",
            "This link is single-use and expires at {{expiresAt}}.",
            "Dashboard: {{origin}}/",
            "MCP endpoint: {{origin}}/mcp",
          ].join("\n"),
        },
      }),
    );
    await readyAuthPlugin(harness);

    expect(notifications).toHaveLength(1);
    const notification = z
      .object({
        recipient: z.object({
          type: z.literal("email"),
          address: z.literal("user@example.com"),
        }),
        title: z.string(),
        body: z.string(),
        sensitivity: z.literal("secret"),
      })
      .parse(notifications[0]);

    expect(notification.title).toBe("Welcome to Rover — set up your passkey");
    expect(notification.recipient).toEqual({
      type: "email",
      address: "user@example.com",
    });
    expect(notification.body).toContain("Your Rover is ready.");
    expect(notification.body).toContain(
      "https://brain.example.com/setup?token=setup_",
    );
    expect(notification.body).toContain("single-use");
    expect(notification.body).toContain("expires at");
    expect(notification.body).toContain(
      "Dashboard: https://brain.example.com/",
    );
    expect(notification.body).toContain(
      "MCP endpoint: https://brain.example.com/mcp",
    );
    expect(notification.body).not.toContain("{{setupUrl}}");
    expect(notification.body).not.toContain("{{expiresAt}}");
    expect(notification.body).not.toContain("{{origin}}");
  });

  it("keeps setup email copy generic when only a recipient is configured", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const notifications: unknown[] = [];

    harness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      notifications.push(message.payload);
      return { success: true, data: { status: "sent" } };
    });

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(harness);

    const notification = z
      .object({ title: z.string(), body: z.string() })
      .parse(notifications[0]);

    expect(notification.title).toBe("Set up your brain passkey");
    expect(notification.body).toContain("Set up your brain passkey");
    expect(notification.body).toContain(
      "Dashboard: https://brain.example.com/",
    );
    expect(notification.body).toContain(
      "MCP endpoint: https://brain.example.com/mcp",
    );
    expect(notification.body).not.toContain("Rover");
  });

  it("waits until ready hooks to request setup email so notification routing is registered", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const notifications: unknown[] = [];

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );

    harness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      notifications.push(message.payload);
      return { success: true, data: { status: "sent" } };
    });

    expect(notifications).toHaveLength(0);
    await readyAuthPlugin(harness);
    expect(notifications).toHaveLength(1);
  });

  it("does not fail registration when no notification subscriber is registered", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(harness);

    const response = await harness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(response);
    const data = setupRequiredToolDataSchema.parse(response.data);
    expect(data.status).toBe("setup_required");
  });

  it("does not fail registration when notification delivery returns failure", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    harness.subscribe(NOTIFICATIONS_SEND, async () => ({
      success: false,
      error: "delivery failed",
    }));

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(harness);

    const response = await harness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(response);
    const data = setupRequiredToolDataSchema.parse(response.data);
    expect(data.status).toBe("setup_required");
  });

  it("does not resend setup email for the same persisted setup token", async () => {
    const storageDir = await tempStorageDir();
    const firstHarness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const firstNotifications: unknown[] = [];
    firstHarness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      firstNotifications.push(message.payload);
      return { success: true, data: { status: "sent", deliveryId: "email_1" } };
    });

    await firstHarness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(firstHarness);
    expect(firstNotifications).toHaveLength(1);

    const firstResponse = await firstHarness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(firstResponse);
    const firstSetup = setupRequiredToolDataSchema.parse(firstResponse.data);

    const secondHarness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const secondNotifications: unknown[] = [];
    secondHarness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      secondNotifications.push(message.payload);
      return { success: true, data: { status: "sent", deliveryId: "email_2" } };
    });

    const secondPlugin = authServicePlugin({
      storageDir,
      issuer: "https://brain.example.com",
      setupEmail: "user@example.com",
    });
    await secondHarness.installPlugin(secondPlugin);
    await readyAuthPlugin(secondHarness);

    const secondResponse = await secondHarness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(secondResponse);
    expect(secondResponse.data).toEqual({
      status: "unavailable",
      reason: "Passkey setup URL is not available.",
    });

    expect(secondNotifications).toHaveLength(0);
    expect(
      await secondPlugin
        .getService()
        .handleRequest(new Request(firstSetup.setupUrl)),
    ).toMatchObject({ status: 200 });
  });

  it("persists hashed setup-token id and recipient — not raw values — at 0o600", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    harness.subscribe(NOTIFICATIONS_SEND, async () => ({
      success: true,
      data: { status: "sent", deliveryId: "email_1" },
    }));

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(harness);

    const storeFile = join(storageDir, "auth.db");
    const fileStats = await stat(storeFile);
    expect(fileStats.mode & 0o777).toBe(0o600);

    const setupResponse = await harness.executeTool(
      "auth-service_get_passkey_setup_url",
      {},
    );
    expectSuccess(setupResponse);
    const setup = setupRequiredToolDataSchema.parse(setupResponse.data);
    const rawToken = new URL(setup.setupUrl).searchParams.get("token") ?? "";
    const database = createClient({ url: `file:${storeFile}` });
    try {
      const rows = await database.execute(
        `SELECT setup_tokens.token_hash, setup_token_deliveries.recipient_hash
          FROM setup_tokens
          INNER JOIN setup_token_deliveries
            ON setup_token_deliveries.token_hash = setup_tokens.token_hash
          WHERE setup_tokens.consumed_at IS NULL`,
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.["token_hash"]).toMatch(/^[0-9a-f]{64}$/);
      expect(rows.rows[0]?.["token_hash"]).not.toBe(rawToken);
      expect(rows.rows[0]?.["recipient_hash"]).toMatch(/^[0-9a-f]{64}$/);
      expect(rows.rows[0]?.["recipient_hash"]).not.toBe("user@example.com");
    } finally {
      database.close();
    }
  });

  it("retries setup email after a failed delivery because no delivery is recorded", async () => {
    const storageDir = await tempStorageDir();
    const firstHarness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const failedNotifications: unknown[] = [];
    firstHarness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      failedNotifications.push(message.payload);
      return { success: false, error: "delivery failed" };
    });

    await firstHarness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(firstHarness);
    expect(failedNotifications).toHaveLength(1);

    const secondHarness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const retriedNotifications: unknown[] = [];
    secondHarness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      retriedNotifications.push(message.payload);
      return { success: true, data: { status: "sent", deliveryId: "email_2" } };
    });

    await secondHarness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(secondHarness);

    expect(retriedNotifications).toHaveLength(1);
  });

  it("resends setup email when the stored setup token has expired", async () => {
    const storageDir = await tempStorageDir();
    await writeFile(
      join(storageDir, "oauth-setup-state.json"),
      `${JSON.stringify(
        {
          setupToken: { token: "setup_old", expiresAt: 1 },
          deliveries: [
            {
              setupTokenId: "old-token-id",
              recipientHash: "old-recipient-hash",
              deliveredAt: 1,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const notifications: unknown[] = [];
    harness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      notifications.push(message.payload);
      return { success: true, data: { status: "sent", deliveryId: "email_1" } };
    });

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(harness);

    expect(notifications).toHaveLength(1);
    const notification = z.object({ body: z.string() }).parse(notifications[0]);
    expect(notification.body).toContain("/setup?token=setup_");
    expect(notification.body).not.toContain("setup_old");
  });

  it("does not request a setup email when setup email is not configured", async () => {
    const storageDir = await tempStorageDir();
    const harness = new PluginTestHarness<AuthServicePlugin>({
      domain: "brain.example.com",
      logContext: "auth-service-test",
    });
    const notifications: unknown[] = [];

    harness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      notifications.push(message.payload);
      return { success: true, data: { status: "sent" } };
    });

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

    harness.subscribe(NOTIFICATIONS_SEND, async (message) => {
      notifications.push(message.payload);
      return { success: true, data: { status: "sent" } };
    });

    await harness.installPlugin(
      authServicePlugin({
        storageDir,
        issuer: "https://brain.example.com",
        setupEmail: "user@example.com",
      }),
    );
    await readyAuthPlugin(harness);

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

    const databaseStats = await stat(join(storageDir, "auth.db"));
    expect(databaseStats.mode & 0o777).toBe(0o600);

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

    expect(await secondService.getRegisteredClient(client.client_id)).toEqual(
      persistedClient,
    );
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

    const session = await service.createAuthSession();
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
      subject: expect.stringMatching(/^usr_/),
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
    const session = await service.createAuthSession();
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

  it("logs out, revokes the current auth session, and clears both cookie names", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const session = await service.createAuthSession();
    expect(session.cookie).toContain("brains_auth_session=");
    const request = new Request("https://brain.example.com/dashboard", {
      headers: { cookie: session.cookie },
    });

    const beforeLogout = await service.getAuthSession(request);
    expect(beforeLogout).toMatchObject({
      subject: expect.stringMatching(/^usr_/),
    });

    const response = await service.handleRequest(
      new Request("https://brain.example.com/logout?return_to=/dashboard", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard");
    const cleared = response.headers.getSetCookie();
    expect(cleared).toHaveLength(2);
    expect(cleared.join("\n")).toContain("brains_auth_session=");
    expect(cleared.join("\n")).toContain("brains_operator_session=");
    expect(cleared.join("\n")).toContain("Max-Age=0");
    expect(cleared.join("\n")).toContain("; Secure");
    expect(await service.getAuthSession(request)).toBeUndefined();
  });

  it("reads the legacy browser cookie during the compatibility window", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const session = await service.createAuthSession();
    const legacyCookie = session.cookie.replace(
      "brains_auth_session",
      "brains_operator_session",
    );

    expect(
      await service.resolveSession(
        new Request("https://brain.example.com/dashboard", {
          headers: { cookie: legacyCookie },
        }),
      ),
    ).toMatchObject({ permissionLevel: "admin" });
  });

  it("prefers the current cookie when both browser cookie names are present", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const anchorSession = await service.createAuthSession();
    const trustedUser = await service.createUser({
      displayName: "Mira",
      role: "trusted",
      status: "active",
    });
    const currentSession = await service.createAuthSession(trustedUser.userId);
    const legacyCookie = anchorSession.cookie.replace(
      "brains_auth_session",
      "brains_operator_session",
    );

    expect(
      await service.resolveSession(
        new Request("https://brain.example.com/dashboard", {
          headers: { cookie: `${legacyCookie}; ${currentSession.cookie}` },
        }),
      ),
    ).toMatchObject({
      userId: trustedUser.userId,
      permissionLevel: "trusted",
    });
  });

  it("marks the auth session cookie Secure outside loopback", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const secure = await service.createAuthSession("single-operator", {
      secure: true,
    });
    expect(secure.cookie).toContain("; Secure");

    const insecure = await service.createAuthSession("single-operator", {
      secure: false,
    });
    expect(insecure.cookie).not.toContain("Secure");
  });

  it("omits Secure on the cleared cookie for loopback logout", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });
    const session = await service.createAuthSession();

    const response = await service.handleRequest(
      new Request("http://localhost:8080/logout", {
        headers: { cookie: session.cookie },
      }),
    );

    const cleared = response.headers.get("set-cookie") ?? "";
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).not.toContain("Secure");
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
    const session = await service.createAuthSession();

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

  it("requires an auth session before showing the authorize page", async () => {
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
    expect(html).toContain("Passkey login required");
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
    const session = await service.createAuthSession();
    const code = await service["runtime"].authCodeStore.createCode({
      clientId: client.client_id,
      redirectUri: "http://127.0.0.1:6274/oauth/callback",
      codeChallenge: challenge,
      subject: session.subject,
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
