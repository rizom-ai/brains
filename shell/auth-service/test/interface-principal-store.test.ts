import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InterfacePrincipalStore } from "../src/interface-principal-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";

const tempDirs: string[] = [];

async function withStore<T>(
  callback: (store: InterfacePrincipalStore, storageDir: string) => Promise<T>,
): Promise<T> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-interface-grants-"));
  tempDirs.push(storageDir);
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  try {
    return await callback(new InterfacePrincipalStore(database.db), storageDir);
  } finally {
    await database.stop();
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("InterfacePrincipalStore", () => {
  it("seeds explicit grants and Anchor facets exactly once", async () => {
    await withStore(async (store) => {
      expect(
        await store.seedConfigOnce({
          admins: ["discord:100", "mcp:stdio"],
          trusted: ["discord:200"],
          anchors: ["discord:100"],
        }),
      ).toBe(true);

      expect(await store.resolve("discord", "100")).toEqual({
        permissionLevel: "admin",
        isAnchor: true,
      });
      expect(await store.resolve("discord", "200")).toEqual({
        permissionLevel: "trusted",
        isAnchor: false,
      });
      expect(await store.resolve("mcp", "stdio")).toEqual({
        permissionLevel: "admin",
        isAnchor: false,
      });
      expect(await store.resolve("discord", "unknown")).toBeUndefined();

      expect(
        await store.seedConfigOnce({
          admins: ["discord:replacement"],
          trusted: [],
          anchors: [],
        }),
      ).toBe(false);
      expect(await store.resolve("discord", "100")).toEqual({
        permissionLevel: "admin",
        isAnchor: true,
      });
      expect(await store.resolve("discord", "replacement")).toBeUndefined();
    });
  });

  it("keeps Anchor identity independent from permission", async () => {
    await withStore(async (store) => {
      await store.seedConfigOnce({
        admins: [],
        trusted: [],
        anchors: ["discord:owner"],
      });

      expect(await store.resolve("discord", "owner")).toEqual({
        permissionLevel: "public",
        isAnchor: true,
      });
    });
  });

  it("reinitializes only access state from the current config", async () => {
    await withStore(async (store) => {
      await store.seedConfigOnce({
        admins: ["discord:old-admin"],
        trusted: ["discord:old-trusted"],
        anchors: ["discord:old-owner"],
      });

      await store.reinitializeFromConfig({
        admins: ["discord:new-admin"],
        trusted: ["discord:new-trusted"],
        anchors: ["discord:new-owner"],
      });

      expect(await store.resolve("discord", "old-admin")).toBeUndefined();
      expect(await store.resolve("discord", "old-trusted")).toBeUndefined();
      expect(await store.resolve("discord", "old-owner")).toBeUndefined();
      expect(await store.resolve("discord", "new-admin")).toEqual({
        permissionLevel: "admin",
        isAnchor: false,
      });
      expect(await store.resolve("discord", "new-trusted")).toEqual({
        permissionLevel: "trusted",
        isAnchor: false,
      });
      expect(await store.resolve("discord", "new-owner")).toEqual({
        permissionLevel: "public",
        isAnchor: true,
      });
    });
  });

  it("normalizes interface prefixes without storing raw principal subjects", async () => {
    await withStore(async (store) => {
      await store.seedConfigOnce({
        admins: [" Discord : 123456789 "],
        trusted: [],
        anchors: [],
      });

      expect(await store.resolve("discord", "123456789")).toEqual({
        permissionLevel: "admin",
        isAnchor: false,
      });
      const state = await store.listActiveState();
      expect(state.grants[0]?.principalKeyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(state)).not.toContain("123456789");
    });
  });
});
