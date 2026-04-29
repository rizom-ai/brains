import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { z, parseYamlDocument } from "@brains/utils";
import { resolveModelName } from "./model-registry";

const externalPluginDeclarationSchema = z
  .object({
    package: z.string().min(1),
    config: z.record(z.unknown()).optional(),
  })
  .strict();

const pluginOverrideEntrySchema = z
  .record(z.unknown())
  .superRefine((entry, ctx) => {
    if (typeof entry["package"] !== "string") return;

    const parsed = externalPluginDeclarationSchema.safeParse(entry);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'external plugin declarations may only contain "package" and optional nested "config"',
      });
    }
  });

const brainYamlSchema = z
  .object({
    brain: z.string(),
    domain: z.string().optional(),
    preset: z.string().optional(),
    model: z.string().optional(),
    plugins: z.record(pluginOverrideEntrySchema).optional(),
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
