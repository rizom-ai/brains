import type { Plugin, EntityTypeConfig } from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { promptSchema, type Prompt } from "./schemas/prompt";
import { promptAdapter, type PromptAdapter } from "./adapters/prompt-adapter";
import packageJson from "../package.json";

/**
 * Prompt EntityPlugin
 *
 * Registers the "prompt" entity type. Prompts are AI instructions
 * stored as markdown files, editable via CMS or text editor.
 * No tools, no generation handler, no templates — just schema + adapter.
 *
 * Prompts are excluded from search embeddings — they're system
 * configuration, not user content.
 */
const promptEntityType = "prompt";

export class PromptPlugin extends EntityPlugin<
  Prompt,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType: typeof promptEntityType = promptEntityType;
  readonly schema: typeof promptSchema = promptSchema;
  readonly adapter: PromptAdapter = promptAdapter;

  constructor() {
    super("prompt", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  public override getEntityTypeConfig(): EntityTypeConfig {
    return { embeddable: false };
  }
}

export function promptPlugin(): Plugin {
  return new PromptPlugin();
}
