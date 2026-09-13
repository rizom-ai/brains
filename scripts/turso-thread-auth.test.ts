// Repository-query proof, not browser/WebAuthn acceptance or runtime replacement.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { AuthUserStore } from "../shell/auth-service/src/user-store";
import { AuthCredentialStore } from "../shell/auth-service/src/credential-store";
import { authRuntimeSchema } from "../shell/auth-service/src/runtime-schema";
import type { AuthRuntimeDB } from "../shell/auth-service/src/runtime-db";
import { TursoThreadProof } from "../shared/db/test/fixtures/turso-thread/client";
import { createProofDatabase } from "../shared/db/test/fixtures/turso-thread/binary-transaction";

const workerUrl = new URL(
  "../shared/db/test/fixtures/turso-thread/worker.ts",
  import.meta.url,
);
const drivers: TursoThreadProof[] = [];
let folder: string;
async function open(
  path: string,
  initialize = true,
): Promise<{
  driver: TursoThreadProof;
  db: AuthRuntimeDB;
  users: AuthUserStore;
  credentials: AuthCredentialStore;
}> {
  const driver = new TursoThreadProof({
    url: pathToFileURL(path).href,
    workerUrl,
  });
  drivers.push(driver);
  const db = createProofDatabase(driver, authRuntimeSchema);
  if (initialize)
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../shell/auth-service/drizzle", import.meta.url),
      ),
    });
  return {
    driver,
    db,
    users: new AuthUserStore(db),
    credentials: new AuthCredentialStore(db),
  };
}
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "brains-thread-auth-"));
});
afterEach(async () => {
  const results = await Promise.allSettled(
    drivers.splice(0).map((driver) => driver.close()),
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  try {
    await rm(folder, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(errors, "Auth proof cleanup failed");
});

describe("real auth stores on the isolated Turso thread", () => {
  it("serializes bootstrap, rolls back partial account creation and preserves guarded changes after restore", async () => {
    const path = join(folder, "auth.db");
    const { driver, db, users } = await open(path);
    const [admin, concurrent] = await Promise.all([
      users.ensureFirstAdminUser({ displayName: "管理员 COMMIT; BEGIN" }),
      new AuthUserStore(db).ensureFirstAdminUser({
        displayName: "Not a second admin",
      }),
    ]);
    expect(concurrent).toEqual(admin);
    expect(await users.listUsers()).toEqual([admin]);
    const people = await users.listPeople();
    expect(people).toHaveLength(1);
    // The person insert precedes the failing unique canonical-ID user insert.
    if (!admin.canonicalId) throw new Error("Missing canonical admin identity");
    await assert.rejects(
      users.createUser({
        displayName: "must roll back",
        canonicalId: admin.canonicalId,
      }),
    );
    expect(await users.listPeople()).toEqual(people);
    expect(await users.listUsers()).toEqual([admin]);
    await assert.rejects(
      users.updateUserRole(admin.id, "public"),
      /personal brain anchor/,
    );
    expect((await users.getUser(admin.id))?.role).toBe("admin");
    await users.configureBrainAnchor({
      kind: "person",
      displayName: "Anchor",
      profileEntityId: "profile-proof",
      subjectDisplayName: "名称 🧠",
    });
    expect((await users.getPerson(admin.personId))?.displayName).toBe(
      "名称 🧠",
    );
    expect((await users.getUser(admin.id))?.displayName).toBe("名称 🧠");
    const member = await users.createUser({
      displayName: "Member",
      role: "admin",
    });
    expect((await users.updateUserRole(member.id, "public")).role).toBe(
      "public",
    );
    expect((await users.updateUserStatus(member.id, "suspended")).status).toBe(
      "suspended",
    );
    expect((await users.deleteSuspendedUser(member.id)).id).toBe(member.id);
    expect(await users.getUser(member.id)).toBeUndefined();
    expect(await users.getPerson(member.personId)).toBeUndefined();
    const expectedUser = await users.getUser(admin.id);
    const expectedPerson = await users.getPerson(admin.personId);
    const expectedAnchor = await users.getBrainAnchor();
    expect(expectedUser?.displayName).toBe("名称 🧠");
    expect(expectedAnchor?.profileEntityId).toBe("profile-proof");
    await driver.close();
    const restoredPath = join(folder, "restored.db");
    await cp(path, restoredPath, { errorOnExist: true, force: false });
    const restored = await open(restoredPath, false);
    expect(await restored.users.getUser(admin.id)).toEqual(expectedUser);
    expect(await restored.users.getPerson(admin.personId)).toEqual(
      expectedPerson,
    );
    expect(await restored.users.getBrainAnchor()).toEqual(expectedAnchor);
    expect(
      (await restored.driver.execute({ sql: "PRAGMA foreign_key_check" })).rows,
    ).toEqual([]);
  });

  it("maps credential booleans and counters and atomically consumes challenges and guards the last passkey", async () => {
    const path = join(folder, "credentials.db");
    const { driver, users, credentials } = await open(path);
    const admin = await users.ensureFirstAdminUser();
    const publicKey = Buffer.from([0, 128, 255]).toString("base64url");
    const first = await credentials.addPasskey({
      id: "key-a",
      userId: admin.id,
      publicKey,
      counter: 0,
      transports: ["usb", "internal"],
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
      createdAt: 1234,
      updatedAt: 1234,
    });
    expect(first).toMatchObject({
      publicKey,
      counter: 0,
      transports: ["usb", "internal"],
      credentialBackedUp: true,
      createdAt: 1234,
    });
    await credentials.addPasskey({
      id: "key-b",
      userId: admin.id,
      publicKey,
      counter: 7,
      credentialBackedUp: false,
      createdAt: 1235,
    });
    expect((await credentials.getPasskey("key-b"))?.credentialBackedUp).toBe(
      false,
    );
    await credentials.updatePasskeyCounter("key-a", 5);
    expect((await credentials.getPasskey("key-a"))?.counter).toBe(5);
    const now = Date.now();
    const challenge = "challenge; COMMIT; 你好";
    await credentials.saveChallenge({
      challenge,
      kind: "authentication",
      userId: admin.id,
      expiresAt: now + 1000,
    });
    expect(
      await credentials.consumeChallenge(challenge, "registration", now),
    ).toBeUndefined();
    const consumed = await Promise.all([
      credentials.consumeChallenge(challenge, "authentication", now),
      credentials.consumeChallenge(challenge, "authentication", now),
    ]);
    const winners = consumed.filter((value) => value !== undefined);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({
      userId: admin.id,
      kind: "authentication",
      consumedAt: now,
    });
    await credentials.saveChallenge({
      challenge: "expired",
      kind: "authentication",
      expiresAt: now,
    });
    expect(
      await credentials.consumeChallenge("expired", "authentication", now),
    ).toBeUndefined();
    const revocations = await Promise.allSettled([
      credentials.revokeOwnedPasskeyIfAnotherRemains("key-a", admin.id),
      credentials.revokeOwnedPasskeyIfAnotherRemains("key-b", admin.id),
    ]);
    expect(
      revocations.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      revocations.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const remaining = await credentials.listPasskeys(admin.id);
    expect(remaining).toHaveLength(1);
    const retained = remaining[0];
    if (!retained) throw new Error("Missing retained credential");
    await assert.rejects(
      credentials.revokeOwnedPasskeyIfAnotherRemains(retained.id, admin.id),
      /last passkey/,
    );
    const records = await Promise.all([
      credentials.getPasskeyRecord("key-a"),
      credentials.getPasskeyRecord("key-b"),
    ]);
    await driver.close();
    const restoredPath = join(folder, "restored.db");
    await cp(path, restoredPath, { errorOnExist: true, force: false });
    const restored = await open(restoredPath, false);
    expect(await restored.credentials.listPasskeys(admin.id)).toEqual(
      remaining,
    );
    expect(
      await Promise.all([
        restored.credentials.getPasskeyRecord("key-a"),
        restored.credentials.getPasskeyRecord("key-b"),
      ]),
    ).toEqual(records);
    expect(
      await restored.credentials.consumeChallenge(
        challenge,
        "authentication",
        now,
      ),
    ).toBeUndefined();
  });
});
