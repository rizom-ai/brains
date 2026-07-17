import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileLinkedInOAuthTokenStore } from "../src/lib/linkedin-oauth-token-store";

const temporaryDirectories: string[] = [];

async function createStore(now = 1_700_000_000_000): Promise<{
  storageDir: string;
  store: FileLinkedInOAuthTokenStore;
}> {
  const storageDir = await mkdtemp(join(tmpdir(), "linkedin-token-store-"));
  temporaryDirectories.push(storageDir);
  return {
    storageDir,
    store: new FileLinkedInOAuthTokenStore({ storageDir, now: () => now }),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("FileLinkedInOAuthTokenStore", () => {
  it("stores tokens atomically with private filesystem permissions", async () => {
    const now = 1_700_000_000_000;
    const { storageDir, store } = await createStore(now);

    await store.storeToken({
      accessToken: " access-token ",
      expiresIn: 3600,
      scope: "r_dma_portability_3rd_party",
      tokenType: "Bearer",
    });

    expect(await store.getAccessToken()).toBe("access-token");
    expect(await store.getStatus()).toEqual({
      connected: true,
      expiresAt: now + 3_600_000,
      scope: "r_dma_portability_3rd_party",
    });
    const tokenFile = join(storageDir, "oauth-token.json");
    const stored = JSON.parse(await readFile(tokenFile, "utf8")) as Record<
      string,
      unknown
    >;
    expect(stored).toEqual({
      version: 1,
      accessToken: "access-token",
      expiresAt: now + 3_600_000,
      scope: "r_dma_portability_3rd_party",
      tokenType: "Bearer",
    });
    expect((await stat(storageDir)).mode & 0o777).toBe(0o700);
    expect((await stat(tokenFile)).mode & 0o777).toBe(0o600);
  });

  it("does not return expired tokens", async () => {
    let now = 1_700_000_000_000;
    const storageDir = await mkdtemp(join(tmpdir(), "linkedin-token-store-"));
    temporaryDirectories.push(storageDir);
    const store = new FileLinkedInOAuthTokenStore({
      storageDir,
      now: (): number => now,
    });
    await store.storeToken({ accessToken: "token", expiresIn: 1 });

    now += 1001;

    expect(await store.getAccessToken()).toBeUndefined();
    expect(await store.getStatus()).toEqual({ connected: false });
  });

  it("clears stored credentials without error when repeated", async () => {
    const { store } = await createStore();
    await store.storeToken({ accessToken: "token", expiresIn: 60 });

    await store.clearToken();
    await store.clearToken();

    expect(await store.getAccessToken()).toBeUndefined();
  });

  it("fails closed for malformed persisted credentials", async () => {
    const { storageDir, store } = await createStore();
    await writeFile(
      join(storageDir, "oauth-token.json"),
      '{"accessToken":',
      "utf8",
    );

    expect(store.getAccessToken()).rejects.toThrow("not valid JSON");
  });
});
