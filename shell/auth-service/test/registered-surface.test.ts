import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authPrincipalResolveContract } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { AuthService, authServicePlugin } from "../src";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function installed(): Promise<ReturnType<typeof createPluginHarness>> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-surface-"));
  tempDirs.push(storageDir);
  const harness = createPluginHarness({
    logger: createSilentLogger(),
    domain: "brain.example.com",
  });
  await harness.installPlugin(
    authServicePlugin({
      storageDir,
      issuer: "https://brain.example.com",
      // Account settings are kept only with a deployment encryption key.
      accountSettingsEncryptionKey: "close-out-test-account-settings-key-0001",
    }),
  );
  return harness;
}

describe("the auth service's registered surface", () => {
  it("registers as auth-service with its one admin tool", async () => {
    const harness = await installed();
    try {
      expect(harness.getPlugin().id).toBe("auth-service");
      expect(
        harness.getCapabilities().tools.map((tool) => ({
          name: tool.name,
          visibility: tool.visibility,
          sideEffects: tool.sideEffects,
        })),
      ).toEqual([
        {
          name: "auth-service_get_passkey_setup_url",
          visibility: "admin",
          sideEffects: "none",
        },
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("serves the OAuth, passkey, account and administration routes, all public", async () => {
    const harness = await installed();
    try {
      const routes = harness.getPlugin().getWebRoutes?.() ?? [];
      expect(routes.every((route) => route.public === true)).toBe(true);
      expect(
        routes.map((route) => `${route.method ?? "GET"} ${route.path}`),
      ).toEqual([
        "GET /.well-known/oauth-authorization-server",
        "OPTIONS /.well-known/oauth-authorization-server",
        "GET /.well-known/jwks.json",
        "OPTIONS /.well-known/jwks.json",
        "GET /.well-known/oauth-protected-resource",
        "OPTIONS /.well-known/oauth-protected-resource",
        "GET /setup",
        "GET /login",
        "GET /logout",
        "POST /logout",
        "GET /authorize",
        "POST /authorize",
        "POST /register",
        "OPTIONS /register",
        "POST /token",
        "OPTIONS /token",
        "POST /revoke",
        "OPTIONS /revoke",
        "GET /auth/account",
        "POST /auth/account/mutations",
        "POST /auth/account/plugin-settings",
        "POST /auth/account/passkeys/options",
        "POST /auth/account/passkeys/verify",
        "GET /auth/admin/anchor",
        "GET /auth/admin/users",
        "GET /auth/admin/audit",
        "GET /auth/admin/channels",
        "POST /auth/admin/mutations",
        "POST /auth/admin/reconciliation",
        "POST /webauthn/register/options",
        "POST /webauthn/register/verify",
        "POST /webauthn/auth/options",
        "POST /webauthn/auth/verify",
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("binds the brain's auth and account-settings backends, and releases both at shutdown", async () => {
    const harness = await installed();
    const shell = harness.getMockShell();
    expect(shell.getAuthRegistry().get()).toBeInstanceOf(AuthService);
    expect(shell.getAccountSettingsRegistry().hasBackend()).toBe(true);

    await harness.reset();

    expect(shell.getAuthRegistry().get()).toBeUndefined();
    expect(shell.getAccountSettingsRegistry().hasBackend()).toBe(false);
  });

  it("answers auth-principal resolution until shutdown", async () => {
    const harness = await installed();
    const bus = harness.getMockShell().getMessageBus();
    const ask = (): Promise<unknown> =>
      bus.send({
        type: authPrincipalResolveContract.name,
        sender: "test",
        payload: { actor: { kind: "user", userId: "nobody" } },
      });
    expect(await ask()).toMatchObject({
      success: true,
      data: { principal: null },
    });

    expect(bus.hasHandlers?.(authPrincipalResolveContract.name)).toBe(true);

    await harness.reset();

    expect(bus.hasHandlers?.(authPrincipalResolveContract.name)).toBe(false);
  });
});
