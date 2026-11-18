import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APP_PASSWORD_TTL_SECONDS,
  RuntimeAppPasswordStore,
} from "../src/app-password-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function withStore(
  run: (context: {
    store: RuntimeAppPasswordStore;
    userId: string;
    clock: { now: number };
  }) => Promise<void>,
): Promise<void> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-app-passwords-"));
  tempDirs.push(storageDir);
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  try {
    const users = new AuthUserStore(database.db);
    const user = await users.ensureFirstAdminUser({ displayName: "Admin" });
    const clock = { now: 1_800_000_000 };
    await run({
      store: new RuntimeAppPasswordStore(database, () => clock.now),
      userId: user.id,
      clock,
    });
  } finally {
    await database.stop();
  }
}

describe("RuntimeAppPasswordStore", () => {
  it("issues a generated username and password and keeps only a hash", async () => {
    await withStore(async ({ store, userId, clock }) => {
      const issued = await store.create({
        userId,
        label: "Laptop",
        access: "read",
      });

      expect(issued.username).toBe(`dav-${issued.record.id}`);
      expect(issued.password.length).toBeGreaterThanOrEqual(43);
      expect(issued.record).toEqual({
        id: issued.record.id,
        userId,
        label: "Laptop",
        access: "read",
        createdAt: clock.now,
        expiresAt: clock.now + APP_PASSWORD_TTL_SECONDS,
      });
      expect(APP_PASSWORD_TTL_SECONDS).toBe(365 * 24 * 60 * 60);
      expect(JSON.stringify(await store.list(userId))).not.toContain(
        issued.password,
      );
    });
  });

  it("resolves the pair it issued, reports the first use and records the last", async () => {
    await withStore(async ({ store, userId, clock }) => {
      const issued = await store.create({
        userId,
        label: "Laptop",
        access: "write",
      });

      clock.now += 60;
      const first = await store.resolve(issued.username, issued.password);
      expect(first).toMatchObject({
        firstUse: true,
        record: { id: issued.record.id, userId, access: "write" },
      });

      clock.now += 60;
      const second = await store.resolve(issued.username, issued.password);
      expect(second?.firstUse).toBe(false);
      expect((await store.list(userId))[0]?.lastUsedAt).toBe(clock.now);
    });
  });

  it("refuses a wrong password, an unknown username and another password's secret", async () => {
    await withStore(async ({ store, userId }) => {
      const one = await store.create({ userId, label: "One", access: "read" });
      const two = await store.create({ userId, label: "Two", access: "read" });

      expect(await store.resolve(one.username, "wrong")).toBeUndefined();
      expect(await store.resolve(one.username, two.password)).toBeUndefined();
      expect(await store.resolve("dav-missing", one.password)).toBeUndefined();
      expect(await store.resolve(one.record.id, one.password)).toBeUndefined();
      expect((await store.list(userId)).every((r) => !r.lastUsedAt)).toBe(true);
    });
  });

  it("stops resolving once revoked, and only its owner can revoke it", async () => {
    await withStore(async ({ store, userId }) => {
      const issued = await store.create({
        userId,
        label: "Laptop",
        access: "read",
      });

      expect(await store.revoke("someone-else", issued.record.id)).toBe(false);
      expect(
        await store.resolve(issued.username, issued.password),
      ).toBeDefined();

      expect(await store.revoke(userId, issued.record.id)).toBe(true);
      expect(await store.revoke(userId, issued.record.id)).toBe(false);
      expect(
        await store.resolve(issued.username, issued.password),
      ).toBeUndefined();
      expect(await store.list(userId)).toEqual([]);
    });
  });

  it("stops resolving a year after creation and still lists the expired password", async () => {
    await withStore(async ({ store, userId, clock }) => {
      const issued = await store.create({
        userId,
        label: "Laptop",
        access: "read",
      });

      clock.now += APP_PASSWORD_TTL_SECONDS - 1;
      expect(
        await store.resolve(issued.username, issued.password),
      ).toBeDefined();

      clock.now += 1;
      expect(
        await store.resolve(issued.username, issued.password),
      ).toBeUndefined();
      expect((await store.list(userId)).map((r) => r.id)).toEqual([
        issued.record.id,
      ]);
    });
  });
});
