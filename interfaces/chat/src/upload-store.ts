/** The ref kind of an upload in the runtime's shared upload store. */
export const canonicalChatUploadRefKind = "upload";

/**
 * The upload namespaces chat kept per platform before it wrote the shared
 * store (2026-07-13). Nothing reads them; chat deletes their uploads
 * directories once at startup.
 */
export const retiredChatUploadNamespaces: readonly string[] = [
  "discord-chat",
  "slack-chat",
];
