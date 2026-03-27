import type { Plugin } from "@brains/plugins";
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
 */
export class PromptPlugin extends EntityPlugin<Prompt> {
  readonly entityType = promptAdapter.entityType;
  readonly schema = promptSchema;
  readonly adapter = promptAdapter;

  constructor() {
    super("prompt", packageJson, {}, undefined);
  }
}

export function promptPlugin(): Plugin {
  return new PromptPlugin();
}
