import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import type { CommandResult } from "../lib/command-result";
import { previewBrainConfigMigration } from "../lib/brain-config-migration";
import type { BrainRecipeName } from "../lib/brain-recipes";

/** Render a reviewed canonical brain.yaml preview without writing it. */
export async function runConfigMigrationPreview(
  directory: string,
  recipe?: BrainRecipeName,
): Promise<CommandResult> {
  const path = join(directory, "brain.yaml");
  try {
    const input = await readFile(path, "utf8");
    const preview = previewBrainConfigMigration(input, { recipe });
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
      message: getErrorMessage(error),
    };
  }
}
