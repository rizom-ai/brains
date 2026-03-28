import type { Plugin, EntityTypeConfig } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { promptSchema, type Prompt } from "./schemas/prompt";
import { promptAdapter } from "./adapters/prompt-adapter";
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
export class PromptPlugin extends EntityPlugin<Prompt> {
  readonly entityType = promptAdapter.entityType;
  readonly schema = promptSchema;
  readonly adapter = promptAdapter;

  constructor() {
    super("prompt", packageJson, {}, undefined);
  }

  public override getEntityTypeConfig(): EntityTypeConfig {
    return { embeddable: false };
  }
}

export function promptPlugin(): Plugin {
  return new PromptPlugin();
}
