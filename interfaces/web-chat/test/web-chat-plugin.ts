import type { Plugin, WebRouteDefinition } from "@brains/plugins";
import { WebChatInterface, type WebChatDeps } from "../src/web-chat-interface";
import type { WebChatConfigInput } from "../src/config";

/** The web chat plugin as the shell holds it: its routes, and ready. */
export type WebChatPlugin = Plugin & {
  getWebRoutes(): WebRouteDefinition[];
  ready(): Promise<void>;
};

/**
 * The web chat interface as the brain creates it, with the collaborators a
 * test hands it. The one place the tests name how it is built, so they read
 * the same before and after it is declared.
 */
export function createWebChatPlugin(
  config: WebChatConfigInput = {},
  deps: WebChatDeps = {},
): WebChatPlugin {
  return new WebChatInterface(config, deps);
}
