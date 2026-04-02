import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { z, fromYaml } from "@brains/utils";
import { resolveModelName } from "./model-registry";

const brainYamlSchema = z
  .object({
    brain: z.string(),
    preset: z.string().optional(),
    model: z.string().optional(),
  })
  .passthrough();

export type BrainYamlConfig = z.infer<typeof brainYamlSchema>;

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

  let raw: unknown;
  try {
    raw = fromYaml(content);
  } catch (err) {
    throw new Error(
      `Invalid brain.yaml: ${err instanceof Error ? err.message : "parse error"}`,
    );
  }

  const result = brainYamlSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid brain.yaml: missing or invalid field(s): ${missing}. Expected at minimum:\n  brain: rover`,
    );
  }

  return {
    ...result.data,
    brain: resolveModelName(result.data.brain),
  };
}
