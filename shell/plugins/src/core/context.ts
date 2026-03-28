/**
 * CorePluginContext is now BasePluginContext.
 * This file re-exports for backward compatibility until CorePlugin is deleted (Phase 8).
 */
export type { BasePluginContext as CorePluginContext } from "../base/context";
export { createBasePluginContext as createCorePluginContext } from "../base/context";

// Re-export namespace interfaces that consumers may import from here
export type {
  IMessagingNamespace,
  IIdentityNamespace,
  IConversationsNamespace,
  IEvalNamespace,
  TypedMessageHandler,
} from "../base/context";
