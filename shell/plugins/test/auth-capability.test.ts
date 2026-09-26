import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type AuthPrincipal,
} from "../src";
import { createStubAuth } from "@brains/plugins/test";
import { AuthRegistry, createAuthReader } from "../src/contracts/auth-registry";

/**
 * Declarative consumers reach auth through the app-scoped registry, without
 * importing the implementation or relying on a module-level active service.
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

describe("reaching auth through the runtime", () => {
  it("provides complete stub capabilities and reports unsupported administration on invocation", () => {
    const registry = AuthRegistry.createFresh();
    registry.register(createStubAuth());
    const reader = createAuthReader(registry);
    const admin = reader.getAdministration();
    expect(admin).toBeDefined();
    expect(Object.isFrozen(admin)).toBe(true);
    expect(() => admin?.listUsers()).toThrow(
      "Administration is not exercised here",
    );
    expect(reader.getCaller()).not.toHaveProperty("listUsers");
    expect(reader.getIdentities()).not.toHaveProperty("getA2ASigningKey");
  });

  it("hands a service the registered caller capability", async () => {
    let seen: AuthPrincipal | undefined;
    const definition = defineServicePlugin(
      {
        id: "console-desk",
        config: z.object({}),
        setup: () => ({}),
      },
      {
        ready: async ({ auth }) => {
          seen = await auth
            .getCaller()
            ?.resolveSession(new Request("https://example.test/"));
        },
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/console-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    harness
      .getMockShell()
      .getAuthRegistry()
      .register(createStubAuth({ principal }));
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    expect(seen).toMatchObject({ userId: "u-1", permissionLevel: "admin" });
  });

  it("answers undefined in a brain with no auth-service", async () => {
    let called = false;
    let resolved: unknown = "unset";
    const definition = defineServicePlugin(
      {
        id: "console-desk",
        config: z.object({}),
        setup: () => ({}),
      },
      {
        ready: async ({ auth }) => {
          called = true;
          resolved = auth.getCaller();
        },
      },
    );
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
