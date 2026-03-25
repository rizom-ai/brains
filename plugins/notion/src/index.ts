import { NotionPlugin } from "./plugin";
import type { NotionConfig } from "./config";

export { NotionPlugin };
export { notionConfigSchema, type NotionConfig } from "./config";

/**
 * Create a Notion plugin instance
 */
export function notionPlugin(config: Partial<NotionConfig> = {}): NotionPlugin {
  return new NotionPlugin(config);
}
