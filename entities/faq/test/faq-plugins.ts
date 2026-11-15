import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { faqPackage, type FaqConfigInput } from "../src";
import packageJson from "../package.json";

/**
 * The faq package's plugins, as the canonical brain installs them: under
 * the faq class's plugin id, its faq type apart.
 */
export function createFaqPlugins(config: FaqConfigInput = {}): Plugin[] {
  return instantiatePluginPackageDefinition(
    faqPackage,
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "faq", ownedTypePluginId: "faq-entity" },
  );
}
