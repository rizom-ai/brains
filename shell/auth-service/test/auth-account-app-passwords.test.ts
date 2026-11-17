import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { AuthService } from "../src";
import { registeredTestChannels } from "./fixtures/registered-channels";

const ISSUER = "https://brain.example.com";
const tempDirs: string[] = [];

const appPasswordSchema = z.strictObject({
  id: z.string(),
  username: z.string(),
  label: z.string(),
  access: z.enum(["read", "write"]),
  createdAt: z.number(),
  expiresAt: z.number(),
  lastUsedAt: z.number().optional(),
});

/** The fields these tests read off the wire. */
const accountSchema = z.looseObject({
  account: z.looseObject({ appPasswords: z.array(appPasswordSchema) }),
});
const createdSchema = accountSchema.extend({
  appPassword: z.strictObject({ username: z.string(), password: z.string() }),
});

async function createService(): Promise<AuthService> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-app-pw-"));
  tempDirs.push(storageDir);
  const service = new AuthService({
    ...registeredTestChannels,
    storageDir,
    issuer: ISSUER,
  });
  await service.initialize();
  return service;
}

function accountRequest(
  path: string,
  cookie: string,
  body?: Record<string, unknown>,
): Request {
  return new Request(`${ISSUER}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: cookie.split(";", 1)[0] ?? cookie,
      ...(body ? { "content-type": "application/json", origin: ISSUER } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function basicRequest(username: string, password: string): Request {
  return new Request(`${ISSUER}/dav/`, {
    headers: { authorization: `Basic ${btoa(`${username}:${password}`)}` },
  });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("auth account app passwords", () => {
  it("creates a read-only app password by default, shows the password once and lists it without the secret", async () => {
    const service = await createService();
    const user = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const session = await service.createAuthSession(user.userId);

    const response = await service.handleRequest(
      accountRequest("/auth/account/mutations", session.cookie, {
        action: "createAppPassword",
        confirmation: "createAppPassword",
        label: "  Laptop  ",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const created = createdSchema.parse(await response.json());
    expect(created.account.appPasswords).toEqual([
      expect.objectContaining({
        username: created.appPassword.username,
        label: "Laptop",
        access: "read",
      }),
    ]);
    const [listed] = created.account.appPasswords;
    expect((listed?.expiresAt ?? 0) - (listed?.createdAt ?? 0)).toBe(
      365 * 24 * 60 * 60,
    );

    const snapshot = await service.handleRequest(
      accountRequest("/auth/account", session.cookie),
    );
    const snapshotText = await snapshot.text();
    expect(snapshotText).not.toContain(created.appPassword.password);
    expect(
      accountSchema.parse(JSON.parse(snapshotText)).account.appPasswords,
    ).toHaveLength(1);

    expect(
      await service.resolveAppPassword(
        basicRequest(
          created.appPassword.username,
          created.appPassword.password,
        ),
      ),
    ).toMatchObject({
      principal: { userId: user.userId, permissionLevel: "trusted" },
      access: "read",
    });

    const { events } = await service.queryAuditEvents({ offset: 0, limit: 20 });
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "auth.account.app_password_created",
        "auth.app_password.first_used",
      ]),
    );
    await service.close();
  });

  it("creates a read-and-write app password when asked", async () => {
    const service = await createService();
    const user = await service.createUser({
      displayName: "Mira",
      role: "admin",
    });
    const session = await service.createAuthSession(user.userId);

    const created = createdSchema.parse(
      await (
        await service.handleRequest(
          accountRequest("/auth/account/mutations", session.cookie, {
            action: "createAppPassword",
            confirmation: "createAppPassword",
            label: "Desktop",
            access: "write",
          }),
        )
      ).json(),
    );
    expect(created.account.appPasswords[0]?.access).toBe("write");
    await service.close();
  });

  it("revokes only the caller's own app password, at once", async () => {
    const service = await createService();
    const mira = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const noor = await service.createUser({
      displayName: "Noor",
      role: "trusted",
    });
    const miraSession = await service.createAuthSession(mira.userId);
    const noorSession = await service.createAuthSession(noor.userId);

    const created = createdSchema.parse(
      await (
        await service.handleRequest(
          accountRequest("/auth/account/mutations", miraSession.cookie, {
            action: "createAppPassword",
            confirmation: "createAppPassword",
            label: "Laptop",
          }),
        )
      ).json(),
    );
    const id = created.account.appPasswords[0]?.id;
    const revoke = (cookie: string): Promise<Response> =>
      service.handleRequest(
        accountRequest("/auth/account/mutations", cookie, {
          action: "revokeAppPassword",
          confirmation: "revokeAppPassword",
          appPasswordId: id,
        }),
      );

    expect((await revoke(noorSession.cookie)).status).toBe(400);
    expect(
      await service.resolveAppPassword(
        basicRequest(
          created.appPassword.username,
          created.appPassword.password,
        ),
      ),
    ).toBeDefined();

    const revoked = await revoke(miraSession.cookie);
    expect(revoked.status).toBe(200);
    expect(
      accountSchema.parse(await revoked.json()).account.appPasswords,
    ).toEqual([]);
    expect(
      await service.resolveAppPassword(
        basicRequest(
          created.appPassword.username,
          created.appPassword.password,
        ),
      ),
    ).toBeUndefined();

    const { events } = await service.queryAuditEvents({ offset: 0, limit: 20 });
    expect(events.map((event) => event.action)).toContain(
      "auth.account.app_password_revoked",
    );
    await service.close();
  });

  it("refuses a public-level account, a missing label and an unconfirmed request", async () => {
    const service = await createService();
    const guest = await service.createUser({
      displayName: "Guest",
      role: "public",
    });
    const member = await service.createUser({
      displayName: "Mira",
      role: "trusted",
    });
    const guestSession = await service.createAuthSession(guest.userId);
    const memberSession = await service.createAuthSession(member.userId);
    const create = (
      cookie: string,
      body: Record<string, unknown>,
    ): Promise<Response> =>
      service.handleRequest(
        accountRequest("/auth/account/mutations", cookie, {
          action: "createAppPassword",
          ...body,
        }),
      );

    expect(
      (
        await create(guestSession.cookie, {
          confirmation: "createAppPassword",
          label: "Laptop",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await create(memberSession.cookie, {
          confirmation: "createAppPassword",
          label: "   ",
        })
      ).status,
    ).toBe(400);
    expect(
      (await create(memberSession.cookie, { label: "Laptop" })).status,
    ).toBe(400);
    expect(
      (
        await create(memberSession.cookie, {
          confirmation: "createAppPassword",
          label: "Laptop",
          access: "admin",
        })
      ).status,
    ).toBe(400);

    const snapshot = accountSchema.parse(
      await (
        await service.handleRequest(
          accountRequest("/auth/account", memberSession.cookie),
        )
      ).json(),
    );
    expect(snapshot.account.appPasswords).toEqual([]);
    await service.close();
  });
});
