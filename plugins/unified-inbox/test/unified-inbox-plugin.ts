import type { Plugin } from "@brains/plugins";
import { UnifiedInboxPlugin } from "../src";

/** The unified inbox service plugin, as the canonical brain composes it. */
export function createUnifiedInboxPlugin(): Plugin {
  return new UnifiedInboxPlugin();
}
