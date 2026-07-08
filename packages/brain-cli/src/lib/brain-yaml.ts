import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseYamlDocument } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import { pluginOverrideEntrySchema } from "@brains/app";
import { resolveModelName } from "./model-registry";

export interface BrainYamlConfig {
  brain: string;
  domain?: string | undefined;
  preset?: string | undefined;
  model?: string | undefined;
  plugins?: Record<string, Record<string, unknown>> | undefined;
  [key: string]: unknown;
}

export type BrainYamlConfigInput = BrainYamlConfig;

const brainYamlSchema: z.ZodType<BrainYamlConfig, BrainYamlConfigInput> =
  z.looseObject({
    brain: z.string(),
    domain: z.string().optional(),
    preset: z.string().optional(),
    model: z.string().optional(),
    plugins: z.record(z.string(), pluginOverrideEntrySchema).optional(),
  });

/**
 * Parse brain.yaml from a directory.
 *
 * Uses proper YAML parsing with Zod validation.
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
  const result = parseYamlDocument(content, brainYamlSchema);

  if (!result.ok) {
    throw new Error(
      `Invalid brain.yaml: ${result.error}. Expected at minimum:\n  brain: rover`,
    );
  }

  return {
    ...result.data,
    brain: resolveModelName(result.data.brain),
  };
}
