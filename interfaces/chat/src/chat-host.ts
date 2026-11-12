import type { InterfaceRuntime } from "@brains/sdk/internal/interface-runtime";

/**
 * What the chat interface's collaborators read and write in the brain, as
 * the interface runtime offers it: the agent, conversations, permissions,
 * gathered answers, spaces, saved entities and the shared upload store.
 */
export type ChatHost = Pick<
  InterfaceRuntime,
  | "agent"
  | "conversations"
  | "permissions"
  | "gather"
  | "spaces"
  | "entityReads"
  | "sharedUploads"
>;
