import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  assessmentConfigSchema,
  derivedSwotPackage,
  swotPackage,
  type AssessmentConfigInput,
} from "../src";
import packageJson from "../package.json";

/** The assessment capability's plugins, as the canonical brain installs them. */
export function createAssessmentPlugins(
  config: AssessmentConfigInput = {},
): Plugin[] {
  const { enableSwotDerivation } = assessmentConfigSchema.parse(config);
  return instantiatePluginPackageDefinition(
    enableSwotDerivation ? derivedSwotPackage : swotPackage,
    {},
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "swot" },
  );
}
