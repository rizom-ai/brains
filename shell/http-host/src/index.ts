/**
 * @brains/http-host - the brain's one HTTP listener
 *
 * Serves the finalized route table, tool-backed API routes, health, shared
 * images and the built site's production and preview output on one port.
 */

export { ServerManager } from "./server-manager";
export type {
  ServerManagerOptions,
  RunningServer,
  ServeFn,
} from "./server-manager";
export { createApiRouteHandler } from "./api-server";
export {
  createRouteToolExecutor,
  type RouteToolExecutor,
} from "./route-tool-executor";
export { placeholderHtml } from "./templates/placeholder";
