import { useEffect } from "react";
import type { StudioChatNavigationState } from "./studio-chat-drafts";

export interface ChatNavigationStateInput {
  onChange: ((state: StudioChatNavigationState) => void) | undefined;
  draft: string;
  uploadCount: number;
  uploadAttemptCount: number;
  sending: boolean;
  uploading: boolean;
}

/**
 * Tells the Studio shell what this workspace would lose if the reader left —
 * an unsent draft, uploads attached or still arriving — and whether it is busy.
 *
 * The clear on unmount is separate and deliberate: the workspace going away is
 * itself the news that there is nothing left to lose. Folding it into the
 * reporting effect would re-clear on every dependency change instead.
 */
export function useChatNavigationState(input: ChatNavigationStateInput): void {
  const {
    onChange,
    draft,
    uploadCount,
    uploadAttemptCount,
    sending,
    uploading,
  } = input;

  useEffect(() => {
    onChange?.({
      hasDraft: Boolean(draft || uploadCount || uploadAttemptCount),
      busy: sending || uploading,
    });
  }, [draft, uploadCount, uploadAttemptCount, sending, uploading, onChange]);

  useEffect(
    () => (): void => onChange?.({ hasDraft: false, busy: false }),
    [onChange],
  );
}
