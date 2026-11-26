import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureHomeserverConfig,
  readHomeserverSecrets,
} from "../src/homeserver-secrets";

const dirs: string[] = [];

async function dataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-matrix-data-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const SITE = {
  serverName: "brain.example.com",
  publicBaseUrl: "https://brain.example.com",
};

describe("the homeserver's configuration, owned by the brain", () => {
  it("writes the configuration with fresh secrets on first boot", async () => {
    const dir = await dataDir();

    const first = await ensureHomeserverConfig({ dataDir: dir, ...SITE });

    expect(first.changed).toBe(true);
    expect(first.secrets.registrationToken.length).toBeGreaterThanOrEqual(32);
    expect(first.secrets.oidcClientSecret.length).toBeGreaterThanOrEqual(32);
    expect(first.secrets.botPassword).not.toBe(first.secrets.registrationToken);
    const config = await readFile(join(dir, "tuwunel.toml"), "utf8");
    expect(config).toContain(
      `registration_token = "${first.secrets.registrationToken}"`,
    );
    expect(config).toContain(
      `client_secret = "${first.secrets.oidcClientSecret}"`,
    );
    expect(config).toContain('server_name = "brain.example.com"');
  });

  it("keeps the secrets and the file on later boots", async () => {
    const dir = await dataDir();
    const first = await ensureHomeserverConfig({ dataDir: dir, ...SITE });
    const written = await readFile(join(dir, "tuwunel.toml"), "utf8");

    const second = await ensureHomeserverConfig({ dataDir: dir, ...SITE });

    expect(second).toEqual({ secrets: first.secrets, changed: false });
    expect(await readFile(join(dir, "tuwunel.toml"), "utf8")).toBe(written);
  });

  it("rewrites the configuration for a new domain with the same secrets", async () => {
    const dir = await dataDir();
    const first = await ensureHomeserverConfig({ dataDir: dir, ...SITE });

    const moved = await ensureHomeserverConfig({
      dataDir: dir,
      serverName: "new.example.com",
      publicBaseUrl: "https://new.example.com",
    });

    expect(moved).toEqual({ secrets: first.secrets, changed: true });
    expect(await readFile(join(dir, "tuwunel.toml"), "utf8")).toContain(
      'server_name = "new.example.com"',
    );
  });

  it("lets another process read the secrets without writing", async () => {
    const dir = await dataDir();
    expect(await readHomeserverSecrets(dir)).toBeUndefined();
    const { secrets } = await ensureHomeserverConfig({ dataDir: dir, ...SITE });

    expect(await readHomeserverSecrets(dir)).toEqual(secrets);
  });

  it("refuses a configuration file it did not write rather than replacing its secrets", async () => {
    const dir = await dataDir();
    await writeFile(join(dir, "tuwunel.toml"), "[global]\nserver_name = 'x'\n");

    expect(ensureHomeserverConfig({ dataDir: dir, ...SITE })).rejects.toThrow(
      "registration_token",
    );
  });
});
