import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService, PasskeyStore, authServicePlugin } from "../src";

const ISSUER = "https://brain.example.com";
const tempDirs: string[] = [];

async function createService(
  options: { withPasskey?: boolean } = {},
): Promise<AuthService> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-admin-"));
  tempDirs.push(storageDir);
  if (options.withPasskey) {
    const now = Math.floor(Date.now() / 1000);
    await new PasskeyStore({ storageDir }).addCredential({
      id: "anchor-credential",
      public_key: Buffer.from("public-key").toString("base64url"),
      counter: 0,
      subject: "single-operator",
      user_name: "Anchor",
      credential_device_type: "singleDevice",
      credential_backed_up: false,
      created_at: now,
      updated_at: now,
    });
  }
  const service = new AuthService({ storageDir, issuer: ISSUER });
  await service.initialize();
  return service;
}

function cookieHeader(cookie: string): string {
  return cookie.split(";", 1)[0] ?? cookie;
}

function adminRequest(
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

describe("auth admin API", () => {
  it("registers only non-agent HTTP management routes", () => {
    const plugin = authServicePlugin();
    expect(plugin.getWebRoutes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/auth/admin/users", method: "GET" }),
        expect.objectContaining({
          path: "/auth/admin/mutations",
          method: "POST",
        }),
      ]),
    );
  });

  it("requires an active anchor session", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "anchor",
    });
    const collaborator = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const collaboratorSession = await service.createAuthSession(
      collaborator.userId,
    );

    const unauthenticated = await service.handleRequest(
      adminRequest("/auth/admin/users"),
    );
    const forbidden = await service.handleRequest(
      adminRequest("/auth/admin/users", collaboratorSession.cookie),
    );

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "Anchor access required" });
    expect(anchor.permissionLevel).toBe("anchor");
  });

  it("requires same-origin JSON and explicit action confirmation", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "anchor",
    });
    const session = await service.createAuthSession(anchor.userId);
    const mutation = {
      action: "createUser",
      confirmation: "createUser",
      displayName: "Mira",
      role: "trusted",
    };

    const crossOrigin = await service.handleRequest(
      adminRequest(
        "/auth/admin/mutations",
        session.cookie,
        mutation,
        "https://evil.example",
      ),
    );
    const unconfirmed = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        ...mutation,
        confirmation: "",
      }),
    );

    expect(crossOrigin.status).toBe(403);
    expect(unconfirmed.status).toBe(400);
    expect(await service.listUsers()).toHaveLength(1);
  });

  it("promotes an agent's represented person into an invited user facet", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "anchor",
    });
    const session = await service.createAuthSession(anchor.userId);

    const response = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "promoteAgentPerson",
        confirmation: "promoteAgentPerson",
        agentId: "agent:mira-field",
        displayName: "Mira Reyes",
        profileEntityId: "person-profile/mira-reyes",
        role: "trusted",
      }),
    );

    expect(response.status).toBe(200);
    const promoted = (await response.json()) as {
      user: { userId: string; personId: string; status: string };
      representation: {
        agentId: string;
        personId: string;
        status: string;
      };
      registration: { setupUrl: string; expiresAt: number };
    };
    expect(promoted.user).toMatchObject({ status: "invited" });
    expect(promoted.representation).toMatchObject({
      agentId: "agent:mira-field",
      personId: promoted.user.personId,
      status: "pending",
    });

    expect(promoted.registration.setupUrl).toStartWith(
      `${ISSUER}/setup?token=`,
    );
    const setupToken = new URL(promoted.registration.setupUrl).searchParams.get(
      "token",
    );
    const optionsResponse = await service.handleRequest(
      new Request(
        `${ISSUER}/webauthn/register/options?setup_token=${encodeURIComponent(setupToken ?? "")}`,
        { method: "POST" },
      ),
    );
    expect(optionsResponse.status).toBe(200);

    const listResponse = await service.handleRequest(
      adminRequest("/auth/admin/users", session.cookie),
    );
    const roster = (await listResponse.json()) as {
      users: Array<{
        userId: string;
        personId: string;
        agents: Array<{ agentId: string; status: string }>;
      }>;
    };
    expect(
      roster.users.find((user) => user.userId === promoted.user.userId),
    ).toMatchObject({
      personId: promoted.user.personId,
      agents: [{ agentId: "agent:mira-field", status: "pending" }],
    });
    expect(await service.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: anchor.userId,
          action: "auth.agent_person.promoted",
          targetId: "agent:mira-field",
        }),
      ]),
    );
  });

  it("creates user-specific passkey registration links after first setup", async () => {
    const service = await createService({ withPasskey: true });
    const [anchor] = await service.listUsers();
    if (!anchor) throw new Error("Expected migrated anchor");
    const collaborator = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const session = await service.createAuthSession(anchor.userId);

    const response = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "startPasskeyRegistration",
        confirmation: "startPasskeyRegistration",
        userId: collaborator.userId,
      }),
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      registration: { setupUrl: string; expiresAt: number };
    };
    expect(result.registration.setupUrl).toStartWith(`${ISSUER}/setup?token=`);

    const setupPage = await service.handleRequest(
      new Request(result.registration.setupUrl),
    );
    expect(setupPage.status).toBe(200);
    expect(await setupPage.text()).not.toContain("become the anchor");

    const token = new URL(result.registration.setupUrl).searchParams.get(
      "token",
    );
    const optionsResponse = await service.handleRequest(
      new Request(
        `${ISSUER}/webauthn/register/options?setup_token=${encodeURIComponent(token ?? "")}`,
        { method: "POST" },
      ),
    );
    expect(optionsResponse.status).toBe(200);
    const registrationOptions = (await optionsResponse.json()) as {
      user: { name: string; displayName: string };
    };
    expect(registrationOptions.user).toMatchObject({
      name: "Mira",
      displayName: "Mira",
    });

    await service.updateUserStatus(collaborator.userId, "suspended", {
      actorUserId: anchor.userId,
    });
    const suspendedResponse = await service.handleRequest(
      new Request(
        `${ISSUER}/webauthn/register/options?setup_token=${encodeURIComponent(token ?? "")}`,
        { method: "POST" },
      ),
    );
    expect(suspendedResponse.status).toBe(400);

    const events = await service.listAuditEvents();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: anchor.userId,
          action: "auth.passkey.registration_started",
          targetId: collaborator.userId,
        }),
      ]),
    );
  });

  it("lists and revokes passkeys without exposing credential material", async () => {
    const service = await createService({ withPasskey: true });
    const [anchor] = await service.listUsers();
    if (!anchor) throw new Error("Expected migrated anchor");
    const session = await service.createAuthSession(anchor.userId);

    const listResponse = await service.handleRequest(
      adminRequest("/auth/admin/users", session.cookie),
    );
    const listText = await listResponse.text();
    expect(listText).toContain("anchor-credential");
    expect(listText).not.toContain("public-key");
    expect(listText).not.toContain("publicKey");

    const revokeResponse = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "revokePasskey",
        confirmation: "revokePasskey",
        credentialId: "anchor-credential",
      }),
    );
    expect(revokeResponse.status).toBe(200);
    expect(await service.listUserPasskeys(anchor.userId)).toEqual([]);
    expect(await service.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: anchor.userId,
          action: "auth.passkey.revoked",
          targetId: "anchor-credential",
        }),
      ]),
    );
  });

  it("manages users and redacted identities with actor-attributed audit", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "anchor",
    });
    const session = await service.createAuthSession(anchor.userId);

    const createResponse = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "createUser",
        confirmation: "createUser",
        displayName: "Mira",
        role: "trusted",
      }),
    );
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as {
      user: { userId: string };
    };

    const attachResponse = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "attachIdentity",
        confirmation: "attachIdentity",
        userId: created.user.userId,
        type: "email",
        subject: "mira@example.com",
        label: "mira@example.com",
      }),
    );
    expect(attachResponse.status).toBe(200);

    const listResponse = await service.handleRequest(
      adminRequest("/auth/admin/users", session.cookie),
    );
    expect(listResponse.status).toBe(200);
    const responseText = await listResponse.text();
    const response = JSON.parse(responseText) as {
      users: Array<{
        userId: string;
        identities: Array<{ id: string; type: string; label?: string }>;
        passkeys: unknown[];
      }>;
    };
    const mira = response.users.find(
      (user) => user.userId === created.user.userId,
    );

    expect(mira).toMatchObject({
      identities: [
        expect.objectContaining({
          type: "email",
          label: "m***@example.com",
        }),
      ],
      passkeys: [],
    });
    expect(responseText).not.toContain("mira@example.com");
    expect(responseText).not.toContain("identityKeyHash");

    const events = await service.listAuditEvents();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: anchor.userId,
          action: "auth.user.created",
          targetId: created.user.userId,
        }),
        expect.objectContaining({
          actorUserId: anchor.userId,
          action: "auth.identity.attached",
        }),
      ]),
    );
  });
});
