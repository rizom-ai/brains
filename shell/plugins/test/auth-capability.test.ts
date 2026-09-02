import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type AuthAuditEvent,
  type AuthImplementation,
  type AuthPrincipal,
} from "../src";

/**
 * What `@brains/admin`, `@brains/studio` and `@brains/dashboard` do today by
 * calling `getActiveAuthService()`, a module-level global in auth-service.
 * A declarative package has no such reach — and should not need one.
 */

const principal: AuthPrincipal = {
  userId: "u-1",
  personId: "p-1",
  displayName: "Operator",
  role: "admin",
  status: "active",
  permissionLevel: "admin",
  isAnchor: true,
};

const auditEvent: AuthAuditEvent = {
  id: "e-1",
  action: "operator.viewed",
  createdAt: 0,
};

/**
 * The administration half is 19 operations this test never calls; a brain
 * that has auth has all of them, so the stub says so without spelling each
 * one out.
 */
const unusedAdministration = new Proxy(
  {},
  {
    get: () => (): never => {
      throw new Error("Administration is not exercised here");
    },
  },
) as AuthImplementation;

function stubAuth(): AuthImplementation {
  return {
    ...unusedAdministration,
    resolveSession: async () => principal,
    resolveBearerGrant: async () => undefined,
    createAuthLoginResponse: () => new Response(null, { status: 302 }),
    recordAuditEvent: async () => auditEvent,
    queryAuditEvents: async () => ({
      events: [auditEvent],
      actions: [],
      total: 1,
    }),
    getIssuer: () => "https://brain.test",
    getA2APeerTrust: async () => undefined,
    getA2ASigningKey: async () => ({
      privateJwk: {
        kty: "OKP",
        crv: "Ed25519",
        x: "x",
        kid: "k",
        use: "sig",
        alg: "EdDSA",
        d: "d",
      },
      keyId: "k",
    }),
    grantA2APeerTrust: async (input: {
      domain: string;
      keyFingerprint: string;
    }) => ({
      domain: input.domain,
      keyFingerprint: input.keyFingerprint,
      grantedLevel: "trusted",
    }),
    revokeA2APeerTrust: async () => undefined,
    resolveIdentityAccess: async () => ({ state: "resolved", principal }),
  };
}

describe("reaching auth through the runtime", () => {
  it("hands a service the registered implementation", async () => {
    let seen: AuthPrincipal | undefined;
    const definition = defineServicePlugin({
      id: "console-desk",
      config: z.object({}),
      setup: () => ({}),
      ready: async ({ auth }) => {
        seen = await auth
          .getCaller()
          ?.resolveSession(new Request("https://example.test/"));
      },
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/console-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    harness.getMockShell().getAuthRegistry().register(stubAuth());
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    expect(seen).toMatchObject({ userId: "u-1", permissionLevel: "admin" });
  });

  it("answers undefined in a brain with no auth-service", async () => {
    let called = false;
    let resolved: unknown = "unset";
    const definition = defineServicePlugin({
      id: "console-desk",
      config: z.object({}),
      setup: () => ({}),
      ready: async ({ auth }) => {
        called = true;
        resolved = auth.getCaller();
      },
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/console-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    expect(called).toBe(true);
    expect(resolved).toBeUndefined();
  });
});
