import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthCredentialStore,
  AuthRuntimeDatabase,
  AuthService,
  authServicePlugin,
} from "../src";

const ISSUER = "https://brain.example.com";
const tempDirs: string[] = [];

async function createService(): Promise<{
  service: AuthService;
  storageDir: string;
}> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-account-"));
  tempDirs.push(storageDir);
  const service = new AuthService({ storageDir, issuer: ISSUER });
  await service.initialize();
  return { service, storageDir };
}

async function addPasskey(
  storageDir: string,
  userId: string,
  id: string,
): Promise<void> {
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  await new AuthCredentialStore(database.db).addPasskey({
    id,
    userId,
    publicKey: Buffer.from(`public-key:${id}`).toString("base64url"),
    counter: 0,
    credentialDeviceType: "multiDevice",
    credentialBackedUp: true,
  });
  await database.stop();
}

function cookieHeader(cookie: string): string {
  return cookie.split(";", 1)[0] ?? cookie;
}

function accountRequest(
  path: string,
  cookie?: string,
  body?: Record<string, unknown>,
  origin: string = ISSUER,
): Request {
  return new Request(`${ISSUER}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(cookie ? { cookie: cookieHeader(cookie) } : {}),
      ...(body ? { "content-type": "application/json", origin } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("auth account API", () => {
  it("registers a separate browser account surface", () => {
    const routes = authServicePlugin().getWebRoutes();
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/account", method: "GET" }),
        expect.objectContaining({ path: "/auth/account", method: "GET" }),
        expect.objectContaining({
          path: "/auth/account/mutations",
          method: "POST",
        }),
        expect.objectContaining({
          path: "/auth/account/passkeys/options",
          method: "POST",
        }),
        expect.objectContaining({
          path: "/auth/account/passkeys/verify",
          method: "POST",
        }),
      ]),
    );
  });

  it("returns only the active session account", async () => {
    const { service } = await createService();
    const user = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const session = await service.createAuthSession(user.userId);

    const response = await service.handleRequest(
      accountRequest("/auth/account", session.cookie),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      account: {
        displayName: "Mira",
        role: "trusted",
        passkeys: [],
        connectedChannels: [],
        sessions: [expect.objectContaining({ current: true })],
      },
    });
    await service.close();
  });

  it("authenticates the page and API without admitting inactive accounts", async () => {
    const { service } = await createService();
    const publicUser = await service.createUser({
      displayName: "Reader",
      role: "public",
    });
    const invited = await service.createUser({
      displayName: "Invitee",
      role: "trusted",
      status: "invited",
    });
    const suspended = await service.createUser({
      displayName: "Paused",
      role: "trusted",
      status: "suspended",
    });
    const publicSession = await service.createAuthSession(publicUser.userId);
    const invitedSession = await service.createAuthSession(invited.userId);
    const suspendedSession = await service.createAuthSession(suspended.userId);

    const anonymousPage = await service.handleRequest(
      accountRequest("/account"),
    );
    expect(anonymousPage.status).toBe(302);
    expect(anonymousPage.headers.get("location")).toBe(
      "/login?return_to=%2Faccount",
    );
    expect(
      (await service.handleRequest(accountRequest("/auth/account"))).status,
    ).toBe(401);
    expect(
      (
        await service.handleRequest(
          accountRequest("/auth/account", invitedSession.cookie),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await service.handleRequest(
          accountRequest("/auth/account", suspendedSession.cookie),
        )
      ).status,
    ).toBe(401);

    const page = await service.handleRequest(
      accountRequest("/account", publicSession.cookie),
    );
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    const html = await page.text();
    expect(html).toContain("Account ledger");
    expect(html).toContain("/auth/account/passkeys/options");
    expect(html).toContain("Sign out everywhere");
    expect(html).toContain('replace(/\\+/g, "-")');
    expect(html).toContain('replace(/\\//g, "_")');
    await service.close();
  });

  it("updates only the session account and returns redacted channel labels", async () => {
    const { service } = await createService();
    const admin = await service.createUser({
      displayName: "Anchor",
      role: "admin",
    });
    const member = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    await service.attachIdentity(
      {
        userId: member.userId,
        type: "email",
        subject: "member@example.com",
        deliverySubject: "member@example.com",
        label: "member@example.com",
        verifiedAt: 1_735_689_600_000,
        source: { kind: "provider", id: "email" },
      },
      { actorUserId: admin.userId },
    );
    await service.attachIdentity(
      {
        userId: member.userId,
        type: "discord",
        subject: "discord-subject-123",
        label: "Mira on Discord",
        verifiedAt: 1_735_689_600_000,
        source: { kind: "provider", id: "discord" },
      },
      { actorUserId: admin.userId },
    );
    const session = await service.createAuthSession(member.userId);

    const forged = await service.handleRequest(
      accountRequest("/auth/account/mutations", session.cookie, {
        action: "updateDisplayName",
        confirmation: "updateDisplayName",
        displayName: "Stolen",
        userId: admin.userId,
      }),
    );
    expect(forged.status).toBe(400);

    const updated = await service.handleRequest(
      accountRequest("/auth/account/mutations", session.cookie, {
        action: "updateDisplayName",
        confirmation: "updateDisplayName",
        displayName: "  Mira Updated  ",
      }),
    );
    expect(updated.status).toBe(200);
    const updatedText = await updated.text();
    expect(updatedText).not.toContain("member@example.com");
    expect(updatedText).not.toContain("discord-subject-123");
    expect(updatedText).not.toContain('"userId"');
    const updatedBody = JSON.parse(updatedText);
    expect(updatedBody).toMatchObject({
      account: {
        displayName: "Mira Updated",
        role: "trusted",
        connectedChannels: [
          { type: "email", label: "m••••@example.com" },
          { type: "discord", label: "M••••••" },
        ],
      },
    });
    expect(
      (await service.listUsers()).find((user) => user.userId === admin.userId),
    ).toMatchObject({ displayName: "Anchor", role: "admin" });
    expect(await service.listAuditEvents()).toContainEqual(
      expect.objectContaining({
        actorUserId: member.userId,
        action: "auth.account.display_name_updated",
        targetId: member.userId,
      }),
    );
    await service.close();
  });

  it("revokes only owned non-last passkeys", async () => {
    const { service, storageDir } = await createService();
    const admin = await service.createUser({
      displayName: "Anchor",
      role: "admin",
    });
    const member = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    await addPasskey(storageDir, admin.userId, "admin-passkey");
    await addPasskey(storageDir, member.userId, "member-passkey-1");
    await addPasskey(storageDir, member.userId, "member-passkey-2");
    const session = await service.createAuthSession(member.userId);

    const forged = await service.handleRequest(
      accountRequest("/auth/account/mutations", session.cookie, {
        action: "revokePasskey",
        confirmation: "revokePasskey",
        credentialId: "admin-passkey",
      }),
    );
    expect(forged.status).toBe(400);
    expect(await forged.json()).toEqual({ error: "Passkey not found" });

    const revoked = await service.handleRequest(
      accountRequest("/auth/account/mutations", session.cookie, {
        action: "revokePasskey",
        confirmation: "revokePasskey",
        credentialId: "member-passkey-1",
      }),
    );
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).account.passkeys).toEqual([
      expect.objectContaining({ id: "member-passkey-2" }),
    ]);

    const last = await service.handleRequest(
      accountRequest("/auth/account/mutations", session.cookie, {
        action: "revokePasskey",
        confirmation: "revokePasskey",
        credentialId: "member-passkey-2",
      }),
    );
    expect(last.status).toBe(400);
    expect(await last.json()).toEqual({
      error: "The last passkey cannot be revoked",
    });
    expect(await service.listUserPasskeys(admin.userId)).toEqual([
      expect.objectContaining({ id: "admin-passkey" }),
    ]);
    expect(await service.listAuditEvents()).toContainEqual(
      expect.objectContaining({
        actorUserId: member.userId,
        action: "auth.account.passkey_revoked",
        targetId: "member-passkey-1",
      }),
    );
    await service.close();
  });

  it("revokes only the caller's selected, other, or all sessions", async () => {
    const { service } = await createService();
    const admin = await service.createUser({
      displayName: "Anchor",
      role: "admin",
    });
    const member = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const adminSession = await service.createAuthSession(admin.userId);
    const current = await service.createAuthSession(member.userId);
    const other = await service.createAuthSession(member.userId);

    const memberAccount = await (
      await service.handleRequest(
        accountRequest("/auth/account", current.cookie),
      )
    ).json();
    const otherSessionId = memberAccount.account.sessions.find(
      (session: { current: boolean }) => !session.current,
    ).id;
    const currentSessionId = memberAccount.account.sessions.find(
      (session: { current: boolean }) => session.current,
    ).id;
    const adminAccount = await (
      await service.handleRequest(
        accountRequest("/auth/account", adminSession.cookie),
      )
    ).json();

    const forged = await service.handleRequest(
      accountRequest("/auth/account/mutations", current.cookie, {
        action: "revokeSession",
        confirmation: "revokeSession",
        sessionId: adminAccount.account.sessions[0].id,
      }),
    );
    expect(forged.status).toBe(400);
    expect(
      (
        await service.handleRequest(
          accountRequest("/auth/account", adminSession.cookie),
        )
      ).status,
    ).toBe(200);

    const revoked = await service.handleRequest(
      accountRequest("/auth/account/mutations", current.cookie, {
        action: "revokeSession",
        confirmation: "revokeSession",
        sessionId: otherSessionId,
      }),
    );
    expect(revoked.status).toBe(200);
    expect(
      (
        await service.handleRequest(
          accountRequest("/auth/account", other.cookie),
        )
      ).status,
    ).toBe(401);

    const currentRefused = await service.handleRequest(
      accountRequest("/auth/account/mutations", current.cookie, {
        action: "revokeSession",
        confirmation: "revokeSession",
        sessionId: currentSessionId,
      }),
    );
    expect(currentRefused.status).toBe(400);

    const third = await service.createAuthSession(member.userId);
    const others = await service.handleRequest(
      accountRequest("/auth/account/mutations", current.cookie, {
        action: "revokeOtherSessions",
        confirmation: "revokeOtherSessions",
      }),
    );
    expect(others.status).toBe(200);
    expect((await others.json()).revoked).toEqual({ sessions: 1 });
    expect(
      (
        await service.handleRequest(
          accountRequest("/auth/account", third.cookie),
        )
      ).status,
    ).toBe(401);

    const all = await service.handleRequest(
      accountRequest("/auth/account/mutations", current.cookie, {
        action: "revokeAllSessions",
        confirmation: "revokeAllSessions",
      }),
    );
    expect(all.status).toBe(200);
    expect(all.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await all.json()).toMatchObject({ signedOut: true });
    expect(
      (
        await service.handleRequest(
          accountRequest("/auth/account", current.cookie),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await service.handleRequest(
          accountRequest("/auth/account", adminSession.cookie),
        )
      ).status,
    ).toBe(200);
    await service.close();
  });

  it("starts passkey registration only for the same-origin session account", async () => {
    const { service } = await createService();
    const member = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const other = await service.createUser({
      displayName: "Other",
      role: "trusted",
    });
    const session = await service.createAuthSession(member.userId);

    const missingOrigin = await service.handleRequest(
      new Request(`${ISSUER}/auth/account/passkeys/options`, {
        method: "POST",
        headers: {
          cookie: cookieHeader(session.cookie),
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(missingOrigin.status).toBe(403);
    const crossOrigin = await service.handleRequest(
      accountRequest(
        "/auth/account/passkeys/options",
        session.cookie,
        {},
        "https://attacker.example.com",
      ),
    );
    expect(crossOrigin.status).toBe(403);
    const forged = await service.handleRequest(
      accountRequest("/auth/account/passkeys/options", session.cookie, {
        userId: other.userId,
      }),
    );
    expect(forged.status).toBe(400);

    const options = await service.handleRequest(
      accountRequest("/auth/account/passkeys/options", session.cookie, {}),
    );
    expect(options.status).toBe(200);
    const passkeyOptions = await options.json();
    expect(passkeyOptions).toMatchObject({
      challenge: expect.any(String),
      user: { name: "Mira", displayName: "Mira" },
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    const forgedVerification = await service.handleRequest(
      accountRequest("/auth/account/passkeys/verify", session.cookie, {
        id: "invalid-credential",
        rawId: "invalid-credential",
        type: "public-key",
        clientExtensionResults: {},
        userId: other.userId,
        response: {
          clientDataJSON: "invalid",
          attestationObject: "invalid",
        },
      }),
    );
    expect(forgedVerification.status).toBe(400);
    expect(await forgedVerification.json()).toEqual({
      error: "Invalid passkey response",
    });

    const invalidVerification = await service.handleRequest(
      accountRequest("/auth/account/passkeys/verify", session.cookie, {
        id: "invalid-credential",
        rawId: "invalid-credential",
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: "webauthn.create",
              challenge: passkeyOptions.challenge,
              origin: ISSUER,
            }),
          ).toString("base64url"),
          attestationObject: "invalid",
          transports: [],
        },
      }),
    );
    expect(invalidVerification.status).toBe(400);
    expect(await service.listAuditEvents()).toContainEqual(
      expect.objectContaining({
        actorUserId: member.userId,
        action: "auth.account.passkey_registration_failed",
        targetId: member.userId,
      }),
    );
    await service.close();
  });
});
