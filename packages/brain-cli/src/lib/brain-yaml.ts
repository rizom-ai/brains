import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  parseInstanceOverrides,
  resolveBrainPackageName,
  type InstanceOverrides,
} from "@brains/app";
import { getErrorMessage } from "@brains/utils/error";
import { parseYamlDocument } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import { CANONICAL_BUNDLE_CONTRACT } from "../model/canonical-bundles";

const selectedBrainSchema = z.object({ brain: z.string() });

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

  if (brainPackage === "@rizom/brain/model") {
    if (overrides.bundles === undefined) {
      throw new Error(
        'Invalid canonical brain.yaml: expected explicit "bundles"',
      );
    }
    if (overrides.bundleContract !== CANONICAL_BUNDLE_CONTRACT) {
      throw new Error(
        `Invalid canonical brain.yaml: expected bundleContract "${CANONICAL_BUNDLE_CONTRACT}". Run "brain config migrate" with an explicitly reviewed recipe.`,
      );
    }
  }

  return {
    ...overrides,
    brain: brainPackage === "@rizom/brain/model" ? "brain" : brainPackage,
  };
}

function readSelectedBrain(input: string): string | undefined {
  // The canonical parser in parseBrainYaml owns syntax and shape errors, so a
  // failure to read the brain name here is not reported.
  const result = parseYamlDocument(input, selectedBrainSchema);
  return result.ok ? result.data.brain : undefined;
}
