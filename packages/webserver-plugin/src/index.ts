import type { Plugin } from "@brains/types";
import { WebserverPlugin } from "./webserver-plugin";
import type { WebserverConfigInput } from "./config";

/**
 * @deprecated Use WebserverConfigInput from './config' instead
 */
export type WebserverPluginOptions = WebserverConfigInput;

// Export configuration types
export {
  webserverConfigSchema,
  type WebserverConfig,
  type WebserverConfigInput,
} from "./config";

// Export the new plugin class
export { WebserverPlugin } from "./webserver-plugin";

/**
 * Create a webserver plugin instance
 * @deprecated Use new WebserverPlugin(config) instead
 */
export function webserverPlugin(options: WebserverConfigInput = {}): Plugin {
  return new WebserverPlugin(options);
}
