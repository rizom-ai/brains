import { useEffect, useMemo, useState } from "react";
import type { FieldDescriptor } from "./api";
import {
  draftKey,
  forgetDraft,
  keepDraft,
  recoverDraft,
  type StoredDraft,
} from "./draft-store";
import {
  editorDocumentKey,
  type EditorWorkflowAction,
  type EditorWorkflowState,
} from "./editor-workflow";

export interface DraftRecovery {
  /** A draft kept for the open entry that differs from it, until decided. */
  offer: Pick<StoredDraft, "savedAt"> | null;
  restore: () => void;
  discard: () => void;
  /** Forget the open entry's kept draft, as when its edits are discarded. */
  forget: () => void;
}

/**
 * Keeps an entry's unsaved edits in this browser, so a reload or a crash
 * does not lose them, and offers them back when the entry opens again.
 * Storage that is unavailable leaves Studio working without recovery.
 */
export function useDraftRecovery(input: {
  principalId: string | null;
  entityType: string | null;
  editor: EditorWorkflowState;
  hasUnsavedChanges: boolean;
  fields: readonly FieldDescriptor[];
  dispatch: (action: EditorWorkflowAction) => void;
  storage?: Storage | undefined;
  now?: () => number;
  /** How long typing pauses before a draft is kept. */
  delay?: number;
}): DraftRecovery {
  const { editor, hasUnsavedChanges, dispatch } = input;
  const now = input.now ?? Date.now;
  const delay = input.delay ?? 500;
  const storage = input.storage ?? browserStorage();
  const key =
    input.principalId && input.entityType && editor.mode.kind !== "browse"
      ? draftKey(
          input.principalId,
          editorDocumentKey(input.entityType, editor.mode),
        )
      : null;
  // Read once per entry, during render, so nothing is kept over it unseen.
  const stored = useMemo(
    () =>
      key && storage ? attempt(() => recoverDraft(storage, key, now())) : null,
    // The clock is read when the entry opens, not on every render.
    [key, storage],
  );
  const [decided, setDecided] = useState<string | null>(null);
  const differs =
    stored !== null &&
    (stored.body !== editor.body ||
      Object.entries(stored.draft).some(
        ([name, value]) =>
          JSON.stringify(value) !== JSON.stringify(editor.draft[name]),
      ));
  const offer = stored && differs && decided !== key ? stored : null;
  const secretFields = input.fields
    .filter((field) => field.secret === true)
    .map((field) => field.name);

  useEffect(() => {
    if (!key || !storage || offer) return;
    if (!hasUnsavedChanges) {
      attempt(() => forgetDraft(storage, key));
      return;
    }
    const timer = setTimeout(() => {
      attempt(() =>
        keepDraft(storage, key, {
          draft: editor.draft,
          body: editor.body,
          ...(editor.mode.kind === "edit" && {
            baseContentHash: editor.mode.entity.contentHash,
          }),
          savedAt: now(),
          secretFields,
        }),
      );
    }, delay);
    return (): void => clearTimeout(timer);
    // secretFields is derived from fields each render; its names are what count.
  }, [key, storage, offer, hasUnsavedChanges, editor.draft, editor.body]);

  return {
    offer: offer ? { savedAt: offer.savedAt } : null,
    restore: (): void => {
      if (!stored || !key) return;
      dispatch({
        type: "draftRestored",
        draft: stored.draft,
        body: stored.body,
      });
      setDecided(key);
    },
    discard: (): void => {
      if (key && storage) attempt(() => forgetDraft(storage, key));
      setDecided(key);
    },
    forget: (): void => {
      if (key && storage) attempt(() => forgetDraft(storage, key));
    },
  };
}

function browserStorage(): Storage | undefined {
  return attempt(() => window.localStorage) ?? undefined;
}

/** Storage can be blocked or full; recovery is a convenience, never a failure. */
function attempt<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    // A browser that refuses storage simply keeps no drafts.
    return null;
  }
}
