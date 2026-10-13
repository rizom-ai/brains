import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { ChatUploadResponse } from "@brains/contracts/chat";
import { studioChatDraftKey } from "./studio-chat-draft-key";
import { StudioChatDraftStore } from "./studio-chat-drafts";

export interface ChatDraftInput {
  /** The app's store, so drafts outlive the workspace; else one of its own. */
  draftStore?: StudioChatDraftStore | undefined;
  apiPath: string | undefined;
  sessionId: string | null;
}

export interface ChatDraft {
  draftStore: StudioChatDraftStore;
  draftKey: string;
  /**
   * The key of the session open now. Async work started under an older key
   * compares against it before touching the composer.
   */
  currentDraftKey: RefObject<string>;
  draft: string;
  uploads: ChatUploadResponse[];
  setDraft: (text: string) => void;
  setUploads: (
    value:
      | ChatUploadResponse[]
      | ((current: ChatUploadResponse[]) => ChatUploadResponse[]),
  ) => void;
}

/** The composer's text and uploads for the open session, kept in the draft store. */
export function useChatDraft(input: ChatDraftInput): ChatDraft {
  const [localDraftStore] = useState(() => new StudioChatDraftStore());
  const draftStore = input.draftStore ?? localDraftStore;
  const draftKey = studioChatDraftKey(input.apiPath, input.sessionId);
  const currentDraftKey = useRef(draftKey);
  currentDraftKey.current = draftKey;
  const { text: draft, uploads } = useSyncExternalStore(
    draftStore.subscribe,
    () => draftStore.read(draftKey),
    () => draftStore.read(draftKey),
  );
  const setDraft = useCallback(
    (text: string) => draftStore.update(draftKey, { text }),
    [draftStore, draftKey],
  );
  const setUploads = useCallback(
    (
      value:
        | ChatUploadResponse[]
        | ((current: ChatUploadResponse[]) => ChatUploadResponse[]),
    ) =>
      draftStore.update(draftKey, {
        uploads:
          typeof value === "function"
            ? value(draftStore.read(draftKey).uploads)
            : value,
      }),
    [draftStore, draftKey],
  );
  return {
    draftStore,
    draftKey,
    currentDraftKey,
    draft,
    uploads,
    setDraft,
    setUploads,
  };
}
