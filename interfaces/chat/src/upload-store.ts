import type { RuntimeUploadScopeOptions } from "@brains/plugins";

export const canonicalChatUploadRefKind = "upload";

export function createCanonicalChatUploadStoreScope(): RuntimeUploadScopeOptions {
  return {
    namespace: "upload",
    refKind: canonicalChatUploadRefKind,
    routePath: "/api/chat/uploads",
  };
}
