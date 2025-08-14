/**
 * @brains/webserver - Static site serving interface
 *
 * This package provides a webserver interface for serving static sites
 * built by the site-builder. It focuses purely on serving functionality,
 * with no content generation or site building capabilities.
 */

export { WebserverInterface } from "./webserver-interface";
export {
  webserverConfigSchema,
  defaultWebserverConfig,
  type WebserverConfig,
} from "./config";

export { ServerManager } from "./server-manager";
export type { ServerManagerOptions } from "./server-manager";
