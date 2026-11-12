import type { Plugin } from "@brains/plugins";
import { ConversationMemoryPlugin, type SummaryConfigInput } from "../src";

/** The conversation-memory package's plugins, as the canonical brain installs them. */
export function createConversationMemoryPlugins(
  config: SummaryConfigInput = {},
): Plugin[] {
  return [new ConversationMemoryPlugin(config)];
}
