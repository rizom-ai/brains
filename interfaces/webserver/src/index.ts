/**
 * @brains/webserver - Static site serving interface
 *
 * This package provides a webserver interface for serving static sites
 * built by the site-builder. It focuses purely on serving functionality,
 * with no content generation or site building capabilities.
 */

export { WebserverInterface } from "./webserver-interface";
export type { WebserverOptions } from "./webserver-interface";

export { ServerManager } from "./server-manager";
export type { ServerManagerOptions } from "./server-manager";
