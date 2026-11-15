import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { createMockAuthBackend } from "../src/test/mock-auth-backend";
import { MemoryAccountSettingsBackend } from "../src/test/memory-account-settings-backend";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withAuthAuthority,
} from "../src";

type Plugin = NonNullable<
  ReturnType<typeof instantiatePluginPackageDefinition>[number]
>;

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  name: string,
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name,
      version: "0.1.0",
    },
  );
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

const noConfig = z.object({});

/** A service that binds what the brain's auth authority binds, at setup. */
function authority(id: string): ReturnType<typeof withAuthAuthority> {
  return withAuthAuthority(
    defineServicePlugin({
      id,
      config: noConfig,
      setup: (context) => {
        const { authAuthority } = serviceRuntime(context);
        authAuthority.accountSettings.bindBackend(
          new MemoryAccountSettingsBackend(),
        );
        // The seeds read, and the runtime projection replaced, as auth-service does.
        void authAuthority.principals.configuredSeeds();
        authAuthority.principals.replaceRuntimeState({
          grants: [],
          anchors: [],
        });
        authAuthority.bind(createMockAuthBackend());
        return {};
      },
    }),
  );
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected a refusal");
}

describe("the brain's auth authority", () => {
  it("binds the auth and account-settings backends, and releases both at cleanup", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const shell = harness.getMockShell();
    await harness.installPlugin(
      instantiate(authority("auth"), "@fixture/auth"),
    );
    expect(shell.getAuthRegistry().get()).toBeDefined();
    expect(shell.getAccountSettingsRegistry().hasBackend()).toBe(true);

    await harness.reset();

    expect(shell.getAuthRegistry().get()).toBeUndefined();
    expect(shell.getAccountSettingsRegistry().hasBackend()).toBe(false);
  });

  it("is held by one package: a second is refused", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      await harness.installPlugin(
        instantiate(authority("auth"), "@fixture/auth"),
      );
      expect(
        await refusal(
          harness.installPlugin(
            instantiate(authority("other-auth"), "@fixture/other-auth"),
          ),
        ),
      ).toContain(
        'Service "@fixture/other-auth:other-auth" claims the auth authority, which "@fixture/auth:auth" holds',
      );
    } finally {
      await harness.reset();
    }
  });

  it("is refused to a service that did not declare it", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      const plain = defineServicePlugin({
        id: "plain",
        config: noConfig,
        setup: (context) => {
          void serviceRuntime(context).authAuthority;
          return {};
        },
      });
      expect(
        await refusal(
          harness.installPlugin(instantiate(plain, "@fixture/plain")),
        ),
      ).toContain("withAuthAuthority");
    } finally {
      await harness.reset();
    }
  });

  it("is declared once", () => {
    expect(() => withAuthAuthority(authority("auth"))).toThrow(
      "declares the auth authority more than once",
    );
  });
});
