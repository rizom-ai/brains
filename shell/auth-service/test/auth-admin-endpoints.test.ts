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
        expect.objectContaining({
          path: "/auth/admin/reconciliation",
          method: "POST",
        }),
        expect.objectContaining({
          path: "/auth/representations",
          method: "GET",
        }),
        expect.objectContaining({
          path: "/auth/representations",
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
      role: "anchor",
    });
    await service.createUser({ displayName: "Mira", role: "trusted" });
    const session = await service.createAuthSession(anchor.userId);
    const listUserIdentities = service.listUserIdentities.bind(service);
    const listUserPasskeys = service.listUserPasskeys.bind(service);
    const listPersonAgents = service.listPersonAgents.bind(service);
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
    service.listPersonAgents = async (
      personId,
    ): ReturnType<typeof listPersonAgents> => {
      perUserQueryCount += 1;
      return listPersonAgents(personId);
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
      role: "anchor",
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
      role: "anchor",
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
        claims: [
          {
            type: "did",
            subject: "did:plc:mira",
            label: "Mira's asserted DID",
          },
        ],
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
    expect(await service.listUserIdentities(promoted.user.userId)).toEqual([
      expect.objectContaining({
        personId: promoted.user.personId,
        type: "did",
        evidence: [
          expect.objectContaining({
            sourceKind: "agent",
            sourceId: "agent:mira-field",
            assurance: "asserted",
          }),
        ],
      }),
    ]);
    expect(
      await service.resolveIdentityAccess({
        type: "did",
        subject: "did:plc:mira",
      }),
    ).toEqual({ state: "denied" });
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

  it("links an existing user's person to an agent pending their consent", async () => {
    const service = await createService();
    const anchor = await service.createUser({
      displayName: "Anchor",
      role: "anchor",
    });
    const collaborator = await service.createUser({
      displayName: "Mira Reyes",
      role: "trusted",
    });
    const session = await service.createAuthSession(anchor.userId);
    const existingClaim = await service.attachIdentity({
      userId: collaborator.userId,
      type: "discord",
      subject: "1442828818493735015",
      verifiedAt: 200,
      source: { kind: "provider", id: "discord" },
    });

    const response = await service.handleRequest(
      adminRequest("/auth/admin/mutations", session.cookie, {
        action: "linkAgentPerson",
        confirmation: "linkAgentPerson",
        agentId: "agent:mira-field",
        userId: collaborator.userId,
        claims: [
          {
            type: "discord",
            subject: "1442828818493735015",
            label: "@mira",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      representation: {
        agentId: "agent:mira-field",
        personId: collaborator.personId,
        status: "pending",
        createdByUserId: anchor.userId,
        consentedByUserId: null,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    });
    expect(await service.listUserIdentities(collaborator.userId)).toEqual([
      expect.objectContaining({
        id: existingClaim.id,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            sourceKind: "provider",
            assurance: "verified",
          }),
          expect.objectContaining({
            sourceKind: "agent",
            sourceId: "agent:mira-field",
            assurance: "asserted",
          }),
        ]),
      }),
    ]);
    expect(await service.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: anchor.userId,
          action: "auth.agent_person.linked",
          targetId: "agent:mira-field",
          metadata: expect.objectContaining({
            personId: collaborator.personId,
            userId: collaborator.userId,
            status: "pending",
          }),
        }),
      ]),
    );

    const collaboratorSession = await service.createAuthSession(
      collaborator.userId,
    );
    const pending = await service.handleRequest(
      adminRequest("/auth/representations", collaboratorSession.cookie),
    );
    expect(pending.status).toBe(200);
    expect(await pending.json()).toEqual({
      representations: [
        expect.objectContaining({
          agentId: "agent:mira-field",
          personId: collaborator.personId,
          status: "pending",
        }),
      ],
    });

    const crossOrigin = await service.handleRequest(
      adminRequest(
        "/auth/representations",
        collaboratorSession.cookie,
        {
          action: "acceptRepresentation",
          confirmation: "acceptRepresentation",
          agentId: "agent:mira-field",
        },
        "https://evil.example",
      ),
    );
    expect(crossOrigin.status).toBe(403);

    const wrongPerson = await service.handleRequest(
      adminRequest("/auth/representations", session.cookie, {
        action: "acceptRepresentation",
        confirmation: "acceptRepresentation",
        agentId: "agent:mira-field",
      }),
    );
    expect(wrongPerson.status).toBe(400);

    const accepted = await service.handleRequest(
      adminRequest("/auth/representations", collaboratorSession.cookie, {
        action: "acceptRepresentation",
        confirmation: "acceptRepresentation",
        agentId: "agent:mira-field",
      }),
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({
      representation: expect.objectContaining({
        agentId: "agent:mira-field",
        personId: collaborator.personId,
        status: "active",
        consentedByUserId: collaborator.userId,
      }),
    });
    expect(await service.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: collaborator.userId,
          action: "auth.agent_person.accepted",
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
