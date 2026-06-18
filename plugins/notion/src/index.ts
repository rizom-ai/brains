import { NotionPlugin } from "./plugin";
import type { NotionConfigInput } from "./config";

export { NotionPlugin };
export {
  notionConfigSchema,
  type NotionConfig,
  type NotionConfigInput,
} from "./config";

/**
 * Create a Notion plugin instance
 */
export function notionPlugin(config: NotionConfigInput): NotionPlugin {
  return new NotionPlugin(config);
}
