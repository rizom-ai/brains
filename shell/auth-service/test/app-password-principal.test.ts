import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RuntimeAppPasswordStore,
  type IssuedAppPassword,
} from "../src/app-password-store";
import { AuthAuditStore } from "../src/audit-store";
import { AuthIdentityStore } from "../src/identity-store";
import { AuthPrincipalService } from "../src/principal-service";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import type { AuthUser } from "../src/runtime-schema";
import { RuntimeAuthSessionStore } from "../src/session-store";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

interface Harness {
  service: AuthPrincipalService;
  users: AuthUserStore;
  appPasswords: RuntimeAppPasswordStore;
  audit: AuthAuditStore;
  admin: AuthUser;
}

async function withHarness(
  run: (harness: Harness) => Promise<void>,
): Promise<void> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-app-principal-"));
  tempDirs.push(storageDir);
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  try {
    const users = new AuthUserStore(database.db);
    const appPasswords = new RuntimeAppPasswordStore(database);
    const audit = new AuthAuditStore(database.db);
    const admin = await users.ensureFirstAdminUser({ displayName: "Admin" });
    await run({
      users,
      appPasswords,
      audit,
      admin,
      service: new AuthPrincipalService({
        issuer: "https://brain.example",
        trustedIssuers: ["https://brain.example"],
        allowLocalhostIssuers: true,
        users,
        identities: new AuthIdentityStore(database.db),
        sessions: new RuntimeAuthSessionStore(database),
        appPasswords,
        audit,
        ensureFirstAdminUser: (): Promise<AuthUser> =>
          users.ensureFirstAdminUser(),
        getJwks: async (): Promise<{ keys: [] }> => ({ keys: [] }),
      }),
    });
  } finally {
    await database.stop();
  }
}

function basicRequest(
  url: string,
  issued: Pick<IssuedAppPassword, "username" | "password">,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    headers: {
      authorization: `Basic ${btoa(`${issued.username}:${issued.password}`)}`,
      ...headers,
    },
  });
}

/** A deployed brain: plain HTTP from the TLS-terminating proxy. */
function proxiedRequest(
  issued: Pick<IssuedAppPassword, "username" | "password">,
  proto: "https" | "http" = "https",
): Request {
  return basicRequest("http://10.0.0.5:8080/dav/", issued, {
    host: "brain.example",
    "x-forwarded-proto": proto,
  });
}

describe("AuthPrincipalService app passwords", () => {
  it("resolves an app password to its owner's principal and access mode", async () => {
    await withHarness(async ({ service, appPasswords, admin }) => {
      const issued = await appPasswords.create({
        userId: admin.id,
        label: "Laptop",
        access: "write",
      });

      expect(await service.resolveAppPassword(proxiedRequest(issued))).toEqual({
        principal: expect.objectContaining({
          userId: admin.id,
          permissionLevel: "admin",
        }),
        access: "write",
        appPasswordId: issued.record.id,
      });
    });
  });

  it("refuses a missing, malformed or wrong credential", async () => {
    await withHarness(async ({ service, appPasswords, admin }) => {
      const issued = await appPasswords.create({
        userId: admin.id,
        label: "Laptop",
        access: "read",
      });
      const refused = async (request: Request): Promise<void> => {
        expect(await service.resolveAppPassword(request)).toBeUndefined();
      };

      await refused(new Request("https://brain.example/dav/"));
      await refused(
        new Request("https://brain.example/dav/", {
          headers: { authorization: `Bearer ${issued.password}` },
        }),
      );
      await refused(
        new Request("https://brain.example/dav/", {
          headers: { authorization: "Basic not-base64!" },
        }),
      );
      await refused(
        new Request("https://brain.example/dav/", {
          headers: { authorization: `Basic ${btoa(issued.username)}` },
        }),
      );
      await refused(
        proxiedRequest({ username: issued.username, password: "wrong" }),
      );
    });
  });

  it("refuses an app password over plain HTTP except on loopback", async () => {
    await withHarness(async ({ service, appPasswords, admin }) => {
      const issued = await appPasswords.create({
        userId: admin.id,
        label: "Laptop",
        access: "read",
      });

      expect(
        await service.resolveAppPassword(proxiedRequest(issued, "http")),
      ).toBeUndefined();
      expect(
        await service.resolveAppPassword(
          basicRequest("http://brain.example/dav/", issued),
        ),
      ).toBeUndefined();
      expect(
        await service.resolveAppPassword(
          basicRequest("http://localhost:8080/dav/", issued),
        ),
      ).toBeDefined();
    });
  });

  it("stops at once for a suspended owner and for a public-level owner", async () => {
    await withHarness(async ({ service, users, appPasswords }) => {
      const member = await users.createUser({
        displayName: "Member",
        role: "trusted",
        status: "active",
      });
      const issued = await appPasswords.create({
        userId: member.id,
        label: "Laptop",
        access: "read",
      });
      expect(
        (await service.resolveAppPassword(proxiedRequest(issued)))?.principal
          .permissionLevel,
      ).toBe("trusted");

      await users.updateUserRole(member.id, "public");
      expect(
        await service.resolveAppPassword(proxiedRequest(issued)),
      ).toBeUndefined();

      await users.updateUserRole(member.id, "trusted");
      await users.updateUserStatus(member.id, "suspended");
      expect(
        await service.resolveAppPassword(proxiedRequest(issued)),
      ).toBeUndefined();
    });
  });

  it("is never a session or a bearer grant", async () => {
    await withHarness(async ({ service, appPasswords, admin }) => {
      const issued = await appPasswords.create({
        userId: admin.id,
        label: "Laptop",
        access: "write",
      });

      expect(
        await service.resolveSession(proxiedRequest(issued)),
      ).toBeUndefined();
      expect(
        await service.resolveBearerGrant(proxiedRequest(issued)),
      ).toBeUndefined();
      // A bearer token is a signed JWT; an app password in its place is not one.
      expect(
        service.resolveBearerGrant(
          new Request("https://brain.example/mcp", {
            headers: { authorization: `Bearer ${issued.password}` },
          }),
        ),
      ).rejects.toThrow("Invalid Compact JWS");
    });
  });

  it("records the first use of an app password, once", async () => {
    await withHarness(async ({ service, appPasswords, audit, admin }) => {
      const issued = await appPasswords.create({
        userId: admin.id,
        label: "Laptop",
        access: "read",
      });

      await service.resolveAppPassword(proxiedRequest(issued));
      await service.resolveAppPassword(proxiedRequest(issued));

      const { events } = await audit.query({
        action: "auth.app_password.first_used",
        offset: 0,
        limit: 10,
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorUserId: admin.id,
        targetType: "app_password",
        targetId: issued.record.id,
      });
    });
  });
});
