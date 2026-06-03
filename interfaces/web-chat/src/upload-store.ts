import {
  RuntimeUploadStore,
  RuntimeUploadStoreError,
  runtimeUploadIdPattern,
  type ResolvedRuntimeUpload,
  type RuntimeUploadRecord,
  type RuntimeUploadResponseBody,
  type RuntimeUploadScopeOptions,
  type RuntimeUploadStoreErrorCode,
  type SaveRuntimeUploadInput,
} from "@brains/plugins";

export const webChatUploadRefKind = "web-chat-upload";
export const webChatUploadIdPattern = runtimeUploadIdPattern;
export const defaultWebChatUploadRetentionMs = 24 * 60 * 60 * 1000;
export const defaultWebChatUploadMaxCount = 200;

export type WebChatUploadRecord = RuntimeUploadRecord & {
  ref: { kind: typeof webChatUploadRefKind; id: string };
};
export type WebChatUploadResponseBody = RuntimeUploadResponseBody & {
  ref: { kind: typeof webChatUploadRefKind; id: string };
};
export type SaveWebChatUploadInput = SaveRuntimeUploadInput;
export type ResolvedWebChatUpload = ResolvedRuntimeUpload & {
  record: WebChatUploadRecord;
};
export type WebChatUploadStoreErrorCode = RuntimeUploadStoreErrorCode;
export { RuntimeUploadStoreError as WebChatUploadStoreError };

export interface WebChatUploadStoreOptions {
  dataDir: string;
  retentionMs?: number | undefined;
  maxCount?: number | undefined;
  createId?: (() => string) | undefined;
  now?: (() => Date) | undefined;
}

const webChatUploadScope = {
  namespace: "web-chat",
  refKind: webChatUploadRefKind,
  routePath: "/api/chat/uploads",
} satisfies Pick<
  RuntimeUploadScopeOptions,
  "namespace" | "refKind" | "routePath"
>;

/** Compatibility wrapper for tests and web-chat-local imports. Runtime code
 * should prefer `context.uploads.scoped(...)` so upload storage stays shared.
 */
export class WebChatUploadStore extends RuntimeUploadStore {
  constructor(options: WebChatUploadStoreOptions) {
    super({ ...webChatUploadScope, ...options });
  }
}

export function createWebChatUploadStoreScope(): RuntimeUploadScopeOptions {
  return webChatUploadScope;
}
