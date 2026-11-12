import type { Plugin } from "@brains/plugins";
import { faqPlugin, type FaqConfigInput } from "../src";

/** The faq package's plugins, as the canonical brain installs them. */
export function createFaqPlugins(config: FaqConfigInput = {}): Plugin[] {
  return [faqPlugin(config)];
}
