import type { Plugin } from "@brains/plugins";
import { assessment, type AssessmentConfigInput } from "../src";

/** The assessment capability's plugins, as the canonical brain installs them. */
export function createAssessmentPlugins(
  config: AssessmentConfigInput = {},
): Plugin[] {
  return assessment(config);
}
