import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandResult } from "../lib/command-result";
import { previewBrainConfigMigration } from "../lib/brain-config-migration";

/** Render a canonical brain.yaml preview. Phase 6 deliberately never writes it. */
export async function runConfigMigrationPreview(
  directory: string,
): Promise<CommandResult> {
  const path = join(directory, "brain.yaml");
  try {
    const input = await readFile(path, "utf8");
    const preview = previewBrainConfigMigration(input);
    if (!preview.changed) {
      return {
        success: true,
        message: `brain.yaml is already canonical. Preview only; no files were written.\n\n${preview.output}`,
      };
    }

    return {
      success: true,
      message: `Canonical brain.yaml migration preview:\nPreview only; no files were written.\n\n${preview.output}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
