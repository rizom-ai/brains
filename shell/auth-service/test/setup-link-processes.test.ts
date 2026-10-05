import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthRuntime, type AuthRuntimeOptions } from "../src/auth-runtime";

const issuer = "https://brain.example.com";
const tempDirs: string[] = [];
const runtimes: AuthRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function sharedStorage(): Promise<string> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-setup-processes-"));
  tempDirs.push(storageDir);
  return storageDir;
}

/** One process's auth runtime over the storage every process shares. */
function processRuntime(
  storageDir: string,
  options: Partial<AuthRuntimeOptions> = {},
): AuthRuntime {
  const runtime = new AuthRuntime({
    storageDir,
    runBackgroundOperation: (operation): Promise<void> => operation(),
    issuer,
    trustedIssuers: new Set([issuer]),
    allowLocalhostIssuers: false,
    anchor: "team",
    anchorProfileEntityId: "profile:anchor",
    ...options,
  });
  runtimes.push(runtime);
  return runtime;
}

async function resolves(runtime: AuthRuntime, url: string): Promise<boolean> {
  return runtime.setupFlow.hasValidSetupToken(new Request(url));
}

describe("setup links across runtime processes", () => {
  it("a worker starting after the web process leaves the web setup link valid", async () => {
    const storageDir = await sharedStorage();
    const web = processRuntime(storageDir);
    await web.initialize();
    const webLink = web.getSetupUrl();
    if (!webLink) throw new Error("The web process logged no setup link");

    const worker = processRuntime(storageDir, { issuesSetupLinks: false });
    await worker.initialize();

    expect(worker.getSetupUrl()).toBeUndefined();
    expect(await resolves(web, webLink)).toBe(true);
  });

  it("an Admin setup link resolves after another process rotated the token", async () => {
    const storageDir = await sharedStorage();
    const first = processRuntime(storageDir);
    await first.initialize();
    const second = processRuntime(storageDir);
    await second.initialize();

    const required = await first.setupFlow.getPasskeySetupRequired(issuer, {
      rotateHidden: true,
    });
    if (!required) throw new Error("No setup link was issued");

    expect(await resolves(first, required.setupUrl)).toBe(true);
    expect(await resolves(second, required.setupUrl)).toBe(true);
  });
});
