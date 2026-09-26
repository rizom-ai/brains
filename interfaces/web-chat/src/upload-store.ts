import {
  createChatApiPaths,
  DEFAULT_CHAT_API_PATH,
} from "@brains/contracts/chat";
import type {
  ResolvedRuntimeUpload,
  RuntimeUploadRecord,
  RuntimeUploadScopeOptions,
} from "@brains/sdk/interfaces";

/**
 * The upload scope web-chat asks the runtime for.
 *
 * All that is left of what was once a store: the store itself is the
 * runtime's, reached through the `uploads` slot, and this names the scope it
 * should be opened under. The route path is part of the scope because a
 * stored upload's URL has to point back at the endpoint that serves it, and
 * that endpoint moves with the configured API path.
 */

export const webChatUploadRefKind = "upload" as const;

export type WebChatUploadRecord = RuntimeUploadRecord & {
  ref: { kind: typeof webChatUploadRefKind; id: string };
};
export type ResolvedWebChatUpload = ResolvedRuntimeUpload & {
  record: WebChatUploadRecord;
};

export function createWebChatUploadStoreScope(
  apiPath: string = DEFAULT_CHAT_API_PATH,
): RuntimeUploadScopeOptions {
  return {
    namespace: "upload",
    refKind: webChatUploadRefKind,
    routePath: createChatApiPaths(apiPath).uploads,
  };
}
