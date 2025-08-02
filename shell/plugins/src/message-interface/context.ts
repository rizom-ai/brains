import type { InterfacePluginContext } from "../interface/context";

/**
 * Context type for message interface plugins
 * Currently just an alias for InterfacePluginContext, but provides
 * a place to extend with message-specific functionality in the future
 */
export type MessageInterfacePluginContext = InterfacePluginContext;
