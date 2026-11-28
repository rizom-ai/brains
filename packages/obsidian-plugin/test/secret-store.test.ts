import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import {
  PASSWORD_SECRET,
  keepPassword,
  loadPluginData,
  storedPluginData,
  storesPassword,
  type SecretStore,
} from "../src/obsidian/settings";

const root = join(import.meta.dir, "..");

/** Obsidian's secret store, as far as the plugin uses it. */
function secretStore(held: Record<string, string> = {}): SecretStore & {
  held: Record<string, string>;
  sets: number;
} {
  const store = {
    held: { ...held },
    sets: 0,
    getSecret: (id: string): string | null => store.held[id] ?? null,
    setSecret: (id: string, secret: string): void => {
      store.held[id] = secret;
      store.sets += 1;
    },
  };
  return store;
}

const settings = {
  address: "brain.example",
  username: "ada",
  syncOnSave: true,
  intervalMinutes: 30,
};

describe("the app password is kept in Obsidian's secret store", () => {
  it("is read from the secret store, not from the data file", () => {
    const secrets = secretStore({ [PASSWORD_SECRET]: "app-password" });

    const data = loadPluginData({ settings }, secrets);

    expect(data.settings.password).toBe("app-password");
    expect(data.settings.address).toBe("brain.example");
  });

  it("is not connected when neither holds one", () => {
    expect(loadPluginData({ settings }, secretStore()).settings.password).toBe(
      "",
    );
  });

  it("never reaches the data file", () => {
    const secrets = secretStore({ [PASSWORD_SECRET]: "app-password" });
    const data = loadPluginData({ settings }, secrets);

    const stored = storedPluginData(data);

    expect(JSON.stringify(stored)).not.toContain("app-password");
    expect(Object.keys(stored.settings)).not.toContain("password");
    expect(stored.settings.address).toBe("brain.example");
    expect(stored.states).toEqual(data.states);
  });

  it("moves a password an older version left in the data file", () => {
    const older = { settings: { ...settings, password: "left-behind" } };
    const secrets = secretStore();

    expect(storesPassword(older)).toBe(true);
    const data = loadPluginData(older, secrets);

    expect(data.settings.password).toBe("left-behind");
    expect(secrets.held[PASSWORD_SECRET]).toBe("left-behind");
    expect(JSON.stringify(storedPluginData(data))).not.toContain("left-behind");
    expect(storesPassword(storedPluginData(data))).toBe(false);
  });

  it("trusts the secret store over a password left in the data file", () => {
    const older = { settings: { ...settings, password: "left-behind" } };
    const secrets = secretStore({ [PASSWORD_SECRET]: "current" });

    expect(loadPluginData(older, secrets).settings.password).toBe("current");
    expect(secrets.held[PASSWORD_SECRET]).toBe("current");
  });

  it("sees no password in a data file without one", () => {
    expect(storesPassword({ settings })).toBe(false);
    expect(storesPassword({ settings: { ...settings, password: "" } })).toBe(
      false,
    );
    expect(storesPassword(null)).toBe(false);
  });

  it("writes the secret only when the password changed", () => {
    const secrets = secretStore();

    keepPassword(secrets, "");
    expect(secrets.sets).toBe(0);

    keepPassword(secrets, "first");
    keepPassword(secrets, "first");
    expect(secrets.sets).toBe(1);
    expect(secrets.held[PASSWORD_SECRET]).toBe("first");

    keepPassword(secrets, "");
    expect(secrets.held[PASSWORD_SECRET]).toBe("");
  });

  it("names the secret the way Obsidian accepts", () => {
    expect(PASSWORD_SECRET).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("what the secret store asks of Obsidian", () => {
  it("needs the Obsidian version that has it", async () => {
    const manifest = z
      .object({ version: z.string(), minAppVersion: z.string() })
      .parse(await Bun.file(join(root, "manifest.json")).json());
    const versions = z
      .record(z.string(), z.string())
      .parse(await Bun.file(join(root, "versions.json")).json());

    expect(manifest.minAppVersion).toBe("1.11.4");
    expect(versions[manifest.version]).toBe("1.11.4");
    // Older Obsidians keep the last version that ran on them.
    expect(versions["0.1.3"]).toBe("1.7.2");
  });

  it("tells the person where the password is kept", async () => {
    const readme = await Bun.file(join(root, "public/README.md")).text();

    expect(readme).toContain("secret storage");
    expect(readme).not.toContain("The app password and the record");
  });
});
