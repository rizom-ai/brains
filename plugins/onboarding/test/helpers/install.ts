import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import onboardingPackage from "../../src";
import type { OnboardingConfigInput } from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The onboarding service, as the runtime would build it.
 *
 * Tests used to construct OnboardingPlugin directly; the package declares
 * itself now, so they go through instantiation instead.
 */
export function onboardingPlugin(config: OnboardingConfigInput = {}): Plugin {
  bindPluginPackageMetadata(onboardingPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    onboardingPackage,
    config,
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Onboarding plugin was not created");
  return plugin;
}
