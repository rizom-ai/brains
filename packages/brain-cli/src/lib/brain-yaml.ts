import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseInstanceOverrides, type InstanceOverrides } from "@brains/app";
import { getErrorMessage } from "@brains/utils/error";
import { resolveModelName } from "./model-registry";

export type BrainYamlConfig = InstanceOverrides & { brain: string };

/**
 * Parse brain.yaml from a directory.
 *
 * Validates with the same instance-overrides schema the runtime boots
 * with, so a file the CLI accepts cannot fail at boot (and vice versa).
 * Normalizes the brain field (strips @brains/ prefix, quotes).
 * Throws if brain.yaml is missing, invalid, or brain field is absent.
 */
export function parseBrainYaml(cwd: string): BrainYamlConfig {
  const yamlPath = join(cwd, "brain.yaml");

  if (!existsSync(yamlPath)) {
    throw new Error(
      `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    );
  }

  const content = readFileSync(yamlPath, "utf-8");
  let overrides: InstanceOverrides;
  try {
    overrides = parseInstanceOverrides(content);
  } catch (error) {
    throw new Error(
      `Invalid brain.yaml: ${getErrorMessage(error)}. Expected at minimum:\n  brain: rover`,
      { cause: error },
    );
  }

  if (!overrides.brain) {
    throw new Error(
      `Invalid brain.yaml: missing "brain" field. Expected at minimum:\n  brain: rover`,
    );
  }

  return {
    ...overrides,
    brain: resolveModelName(overrides.brain),
  };
}
