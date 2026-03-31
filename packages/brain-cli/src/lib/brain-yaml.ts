import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { resolveModelName } from "./model-registry";

export interface BrainYamlConfig {
  brain: string;
  preset?: string;
  [key: string]: unknown;
}

/**
 * Parse brain.yaml from a directory.
 *
 * Normalizes the brain field (strips @brains/ prefix, quotes).
 * Throws if brain.yaml is missing or brain field is absent.
 */
export function parseBrainYaml(cwd: string): BrainYamlConfig {
  const yamlPath = join(cwd, "brain.yaml");

  if (!existsSync(yamlPath)) {
    throw new Error(
      `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    );
  }

  const content = readFileSync(yamlPath, "utf-8");

  // Simple YAML parsing for the brain field — avoid heavy deps in CLI
  const brainMatch = content.match(/^brain:\s*(.+)$/m);
  if (!brainMatch?.[1]) {
    throw new Error(
      "brain.yaml is missing the 'brain' field. Expected: brain: rover",
    );
  }

  const presetMatch = content.match(/^preset:\s*(.+)$/m);

  return {
    brain: resolveModelName(brainMatch[1]),
    ...(presetMatch?.[1] && { preset: presetMatch[1].trim() }),
  };
}
