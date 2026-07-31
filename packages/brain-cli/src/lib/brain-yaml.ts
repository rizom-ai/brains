import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  parseInstanceOverrides,
  resolveBrainPackageName,
  type InstanceOverrides,
} from "@brains/app";
import { getErrorMessage } from "@brains/utils/error";
import { fromYaml } from "@brains/utils/yaml";

export type BrainYamlConfig = InstanceOverrides & { brain: string };

/** Parse and validate an instance's canonical brain.yaml. */
export function parseBrainYaml(cwd: string): BrainYamlConfig {
  const yamlPath = join(cwd, "brain.yaml");
  if (!existsSync(yamlPath)) {
    throw new Error(
      `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    );
  }

  const input = readFileSync(yamlPath, "utf-8");
  const selectedBrain = readSelectedBrain(input);
  if (selectedBrain !== undefined) {
    resolveBrainPackageName(selectedBrain);
  }

  let overrides: InstanceOverrides;
  try {
    overrides = parseInstanceOverrides(input);
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

function readSelectedBrain(input: string): string | undefined {
  try {
    const parsed = fromYaml<unknown>(input);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>)["brain"] === "string"
    ) {
      return (parsed as Record<string, unknown>)["brain"] as string;
    }
  } catch {
    // The canonical parser below owns syntax and shape errors.
  }
  return undefined;
}
