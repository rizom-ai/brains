import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import onboardingPackage, { type OnboardingConfigInput } from "../src";

/** The onboarding service plugin, as the canonical brain composes it. */
export function onboardingPlugin(config: OnboardingConfigInput = {}): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    onboardingPackage,
    config,
    { name: "@brains/onboarding", version: "0.0.0-test" },
    // Under the id its class had, after the plugins its playbooks belong to.
    { pluginId: "onboarding", dependencies: ["playbook", "playbooks"] },
  );
  if (!plugin) throw new Error("Onboarding installs no plugin");
  return plugin;
}
