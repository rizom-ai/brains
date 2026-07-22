import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService, authServicePlugin } from "../src";
import { seedRuntimePasskeyCredential } from "./runtime-passkey-fixture";

const ISSUER = "https://brain.example.com";
const tempDirs: string[] = [];

async function createService(
  options: {
    withPasskey?: boolean;
    anchor?: "person" | "team" | "organization";
    profileName?: string;
  } = {},
): Promise<AuthService> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-admin-"));
  tempDirs.push(storageDir);
  if (options.withPasskey) {
    await seedRuntimePasskeyCredential(storageDir, "anchor-credential");
  }
  const service = new AuthService({
    storageDir,
    issuer: ISSUER,
    ...(options.anchor ? { anchor: options.anchor } : {}),
    ...(options.profileName
      ? {
          resolveProfileDisplayName: async (): Promise<string | undefined> =>
            options.profileName,
        }
      : {}),
  });
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
        expect.objectContaining({ path: "/auth/admin/anchor", method: "GET" }),
        expect.objectContaining({
          path: "/auth/admin/mutations",
          method: "POST",
        }),
        expect.objectContaining({
          path: "/auth/admin/reconciliation",
          method: "POST",
        }),
      ]),
    );
    expect(
      plugin
        .getWebRoutes()
        .some((route) => route.path.includes("representations")),
    ).toBe(false);
  });

  it("requires an active admin session", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "admin",
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
    expect(await forbidden.json()).toEqual({ error: "Admin access required" });
    expect(anchor.permissionLevel).toBe("admin");
  });

  it("reads the config-declared Anchor with its CMS profile name", async () => {
    const service = await createService({
      anchor: "organization",
      profileName: "Rizom",
    });
    const firstSession = await service.createAuthSession();
    await service.createUser({ displayName: "Mira", role: "admin" });

    const response = await service.handleRequest(
      adminRequest("/auth/admin/anchor", firstSession.cookie),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      anchor: {
        kind: "collective",
        configuredKind: "organization",
        displayName: "Rizom",
        profileEntityId: "anchor-profile/anchor-profile",
        administeredBy: 2,
      },
    });
    expect((await service.listUsers()).map((user) => user.isAnchor)).toEqual([
      false,
      false,
    ]);
  });

  it("uses the CMS profile name for the personal Anchor roster entry", async () => {
    const service = await createService({
      anchor: "person",
      profileName: "Alice Morgan",
    });
    const session = await service.createAuthSession();

    const response = await service.handleRequest(
      adminRequest("/auth/admin/users", session.cookie),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      users: [
        {
          displayName: "Alice Morgan",
          isAnchor: true,
          profileEntityId: "anchor-profile/anchor-profile",
        },
      ],
    });
  });

  it("rejects runtime Anchor ownership mutations", async () => {
    const service = await createService({ anchor: "team" });
    const session = await service.createAuthSession();

    const response = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "updateBrainAnchor",
        confirmation: "updateBrainAnchor",
        kind: "person",
        userId: session.subject,
      }),
    );

    expect(response.status).toBe(400);
    expect((await service.getBrainAnchor()).configuredKind).toBe("team");
  });

  it("requires same-origin JSON and explicit action confirmation", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "admin",
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
    const crossOriginReconciliation = await service.handleRequest(
      adminRequest(
        "/auth/admin/reconciliation",
        session.cookie,
        { claims: [{ type: "did", subject: "did:example:mira" }] },
        "https://evil.example",
      ),
    );

    expect(crossOrigin.status).toBe(403);
    expect(crossOriginReconciliation.status).toBe(403);
    expect(unconfirmed.status).toBe(400);
    expect(await service.listUsers()).toHaveLength(1);
  });

  it("loads the admin roster without per-user query fan-out", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "admin",
    });
    await service.createUser({ displayName: "Mira", role: "trusted" });
    const session = await service.createAuthSession(anchor.userId);
    const listUserIdentities = service.listUserIdentities.bind(service);
    const listUserPasskeys = service.listUserPasskeys.bind(service);
    const listPersonExternalPeers =
      service.listPersonExternalPeers.bind(service);
    let perUserQueryCount = 0;
    service.listUserIdentities = async (
      userId,
    ): ReturnType<typeof listUserIdentities> => {
      perUserQueryCount += 1;
      return listUserIdentities(userId);
    };
    service.listUserPasskeys = async (
      userId,
    ): ReturnType<typeof listUserPasskeys> => {
      perUserQueryCount += 1;
      return listUserPasskeys(userId);
    };
    service.listPersonExternalPeers = async (
      personId,
    ): ReturnType<typeof listPersonExternalPeers> => {
      perUserQueryCount += 1;
      return listPersonExternalPeers(personId);
    };

    const response = await service.handleRequest(
      adminRequest("/auth/admin/users", session.cookie),
    );

    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { users: unknown[] }).users,
    ).toHaveLength(2);
    expect(perUserQueryCount).toBe(0);
  });

  it("previews exact verified matches without exposing canonical subjects", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "admin",
    });
    const mira = await service.createUser({
      displayName: "Mira Reyes",
      role: "trusted",
    });
    const jules = await service.createUser({
      displayName: "Jules Chen",
      role: "trusted",
    });
    await service.attachIdentity({
      userId: mira.userId,
      type: "did",
      subject: "did:example:mira",
      label: "Mira DID",
      verifiedAt: Date.now(),
    });
    await service.attachIdentity({
      userId: jules.userId,
      type: "email",
      subject: "jules@example.com",
      label: "Jules email",
      verifiedAt: Date.now(),
    });
    const session = await service.createAuthSession(anchor.userId);

    const unique = await service.handleRequest(
      adminRequest("/auth/admin/reconciliation", session.cookie, {
        claims: [
          {
            type: "did",
            subject: "did:example:mira",
            label: "Agent-carried DID",
          },
        ],
      }),
    );
    const uniqueText = await unique.text();

    expect(unique.status).toBe(200);
    expect(JSON.parse(uniqueText)).toEqual({
      state: "unique_verified_match",
      suggestedUserId: mira.userId,
      claims: [
        {
          index: 0,
          type: "did",
          label: "Agent-carried DID",
          state: "verified_match",
          owner: {
            personId: mira.personId,
            userId: mira.userId,
            displayName: "Mira Reyes",
            status: "active",
          },
        },
      ],
    });
    expect(uniqueText).not.toContain("did:example:mira");
    expect(uniqueText).not.toContain("identityKeyHash");

    const conflict = await service.handleRequest(
      adminRequest("/auth/admin/reconciliation", session.cookie, {
        claims: [
          { type: "did", subject: "did:example:mira", label: "DID" },
          {
            type: "email",
            subject: "jules@example.com",
            label: "Email",
          },
        ],
      }),
    );

    expect(conflict.status).toBe(200);
    expect(await conflict.json()).toMatchObject({
      state: "cross_person_conflict",
      claims: [
        {
          state: "verified_match",
          owner: { userId: mira.userId, displayName: "Mira Reyes" },
        },
        {
          state: "verified_match",
          owner: { userId: jules.userId, displayName: "Jules Chen" },
        },
      ],
    });
  });

  it("does not preselect asserted-only identity ownership", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "admin",
    });
    const mira = await service.createUser({
      displayName: "Mira Reyes",
      role: "trusted",
    });
    await service.attachIdentity({
      userId: mira.userId,
      type: "did",
      subject: "did:example:asserted",
      label: "Asserted DID",
      source: { kind: "agent", id: "agent.example" },
    });
    const session = await service.createAuthSession(anchor.userId);

    const response = await service.handleRequest(
      adminRequest("/auth/admin/reconciliation", session.cookie, {
        claims: [
          {
            type: "did",
            subject: "did:example:asserted",
            label: "Asserted DID",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: "no_verified_match",
      claims: [
        {
          index: 0,
          type: "did",
          label: "Asserted DID",
          state: "asserted_match",
          owner: {
            personId: mira.personId,
            userId: mira.userId,
            displayName: "Mira Reyes",
            status: "active",
          },
        },
      ],
    });
  });

  it("invites a person from an independent external peer", async () => {
    const service = await createService();
    const admin = await service.createUser({
      displayName: "Admin",
      role: "admin",
    });
    const session = await service.createAuthSession(admin.userId);

    const response = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "inviteExternalPeerPerson",
        confirmation: "inviteExternalPeerPerson",
        peerId: "did:web:mira.example",
        displayName: "Mira Reyes",
        role: "trusted",
        delivery: {
          type: "email",
          subject: "mira@example.com",
        },
      }),
    );

    expect(response.status).toBe(200);
    const invited = (await response.json()) as {
      user: { userId: string; personId: string; status: string };
      peer: { peerId: string; personId: string; verificationStatus: string };
      registration: {
        setupUrl: string;
        expiresAt: number;
        delivery: { type: string; label: string };
      };
    };
    expect(invited.user).toMatchObject({ status: "invited" });
    expect(invited.peer).toMatchObject({
      peerId: "did:web:mira.example",
      personId: invited.user.personId,
      verificationStatus: "unverified",
    });
    expect(invited.registration.setupUrl).toStartWith(`${ISSUER}/setup?token=`);
    expect(invited.registration.delivery).toEqual({
      type: "email",
      label: "Email address",
    });
    expect(JSON.stringify(invited)).not.toContain("mira@example.com");
    expect(await service.listUserIdentities(invited.user.userId)).toEqual([
      expect.objectContaining({
        type: "email",
        label: "mira@example.com",
        evidence: [
          expect.objectContaining({
            sourceKind: "admin",
            assurance: "asserted",
          }),
        ],
      }),
    ]);

    const listResponse = await service.handleRequest(
      adminRequest("/auth/admin/users", session.cookie),
    );
    const roster = (await listResponse.json()) as {
      users: Array<{
        userId: string;
        externalPeers: Array<{ peerId: string }>;
      }>;
    };
    expect(
      roster.users.find((user) => user.userId === invited.user.userId),
    ).toMatchObject({
      externalPeers: [{ peerId: "did:web:mira.example" }],
    });
    expect(await service.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: admin.userId,
          action: "auth.external_peer.invited",
          targetId: "did:web:mira.example",
        }),
      ]),
    );
  });

  it("links an existing account to an independent external peer", async () => {
    const service = await createService();
    const admin = await service.createUser({
      displayName: "Admin",
      role: "admin",
    });
    const collaborator = await service.createUser({
      displayName: "Mira Reyes",
      role: "trusted",
    });
    const session = await service.createAuthSession(admin.userId);

    const response = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "linkExternalPeer",
        confirmation: "linkExternalPeer",
        peerId: "did:web:mira.example",
        userId: collaborator.userId,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      peer: {
        peerId: "did:web:mira.example",
        personId: collaborator.personId,
        verificationStatus: "unverified",
        createdByUserId: admin.userId,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    });
    expect(await service.listUserIdentities(collaborator.userId)).toEqual([]);
    expect(await service.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: admin.userId,
          action: "auth.external_peer.linked",
          targetId: "did:web:mira.example",
          metadata: expect.objectContaining({
            personId: collaborator.personId,
            userId: collaborator.userId,
          }),
        }),
      ]),
    );
  });

  it("lists actor-attributed audit events for Admins only", async () => {
    const service = await createService();
    const admin = await service.createUser({
      displayName: "Admin",
      role: "admin",
    });
    const collaborator = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const adminSession = await service.createAuthSession(admin.userId);
    const collaboratorSession = await service.createAuthSession(
      collaborator.userId,
    );
    const forbidden = await service.handleRequest(
      adminRequest("/auth/admin/audit", collaboratorSession.cookie),
    );
    await service.updateUserStatus(collaborator.userId, "suspended", {
      actorUserId: admin.userId,
    });
    const response = await service.handleRequest(
      adminRequest("/auth/admin/audit", adminSession.cookie),
    );

    expect(forbidden.status).toBe(403);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      events: Array<{
        actorUserId?: string;
        action: string;
        targetId?: string;
      }>;
    };
    expect(body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: admin.userId,
          action: "auth.user.status_updated",
          targetId: collaborator.userId,
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
        delivery: {
          type: "email",
          subject: "mira@example.com",
        },
      }),
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      registration: { setupUrl: string; expiresAt: number };
    };
    expect(result.registration.setupUrl).toStartWith(`${ISSUER}/setup?token=`);
    expect(JSON.stringify(result)).not.toContain("mira@example.com");
    expect(await service.listUserIdentities(collaborator.userId)).toEqual([
      expect.objectContaining({
        type: "email",
        label: "mira@example.com",
        evidence: [
          expect.objectContaining({
            sourceKind: "admin",
            assurance: "asserted",
          }),
        ],
      }),
    ]);
    expect(JSON.stringify(await service.listAuditEvents())).not.toContain(
      "mira@example.com",
    );

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

  it("requires a human-facing label for Discord setup delivery", async () => {
    const service = await createService({ withPasskey: true });
    const [anchor] = await service.listUsers();
    if (!anchor) throw new Error("Expected migrated anchor");
    const collaborator = await service.createUser({
      displayName: "Mira",
      role: "trusted",
      status: "invited",
    });
    const session = await service.createAuthSession(anchor.userId);

    const response = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "startPasskeyRegistration",
        confirmation: "startPasskeyRegistration",
        userId: collaborator.userId,
        delivery: {
          type: "discord",
          subject: "1442828818493735015",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid or unconfirmed auth mutation",
    });
    expect(await service.listUserIdentities(collaborator.userId)).toEqual([]);
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

  it("shows verified email labels while redacting machine identity fields", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "admin",
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
          label: "mira@example.com",
        }),
      ],
      passkeys: [],
    });
    expect(responseText).not.toContain("identityKeyHash");
    expect(responseText).not.toContain('"subject"');

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
