import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  parseInstanceOverrides,
  resolveBrainPackageName,
  type InstanceOverrides,
} from "@brains/app";
import { getErrorMessage } from "@brains/utils/error";

export type BrainYamlConfig = InstanceOverrides & { brain: string };

/** Parse and validate an instance's canonical brain.yaml. */
export function parseBrainYaml(cwd: string): BrainYamlConfig {
  const yamlPath = join(cwd, "brain.yaml");
  if (!existsSync(yamlPath)) {
    throw new Error(
      `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    );
  }

  let overrides: InstanceOverrides;
  try {
    overrides = parseInstanceOverrides(readFileSync(yamlPath, "utf-8"));
  } catch (error) {
    throw new Error(`Invalid brain.yaml: ${getErrorMessage(error)}`, {
      cause: error,
    });
  }

  let brainPackage: string;
  try {
    brainPackage = resolveBrainPackageName(overrides.brain);
  } catch (error) {
    throw new Error(getErrorMessage(error), { cause: error });
  }

  if (
    brainPackage === "@rizom/brain/model" &&
    overrides.bundles === undefined
  ) {
    throw new Error(
      'Invalid canonical brain.yaml: expected explicit "bundles"',
    );
  }

  return {
    ...overrides,
    brain: brainPackage === "@rizom/brain/model" ? "brain" : brainPackage,
  };
}
