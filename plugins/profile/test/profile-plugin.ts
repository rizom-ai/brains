import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  baseEntitySchema,
  createTestEntityAdapter,
  type createPluginHarness,
} from "@brains/plugins/test";
import profilePackage, { type ProfileConfigInput } from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

/** The profile service plugin, as the canonical brain composes it. */
export function profilePlugin(config: ProfileConfigInput = {}): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    profilePackage,
    config,
    { name: "@brains/profile", version: "0.0.0-test" },
    // Under the id its class had.
    { pluginId: "profile" },
  );
  if (!plugin) throw new Error("Profile installs no plugin");
  return plugin;
}

/**
 * The shell's identity types, registered as the shell registers them before
 * any plugin, so profile can claim them.
 */
export function registerIdentityTypes(harness: Harness): void {
  const registry = harness.getEntityRegistry();
  for (const type of ["anchor-profile", "brain-character"]) {
    registry.registerEntityType(
      type,
      baseEntitySchema,
      createTestEntityAdapter(type, { isSingleton: true }),
    );
  }
}

/** Profile on a harness whose shell has registered its identity types. */
export async function installProfile(
  harness: Harness,
  config: ProfileConfigInput = {},
): Promise<Plugin> {
  registerIdentityTypes(harness);
  const plugin = profilePlugin(config);
  await harness.installPlugin(plugin);
  return plugin;
}
