import { useEffect, useRef, type RefObject } from "react";

export interface InitialIntentInput {
  /** A question was asked before the box mounted: send it once ready. */
  submitOnReady: boolean;
  busy: boolean;
  canSend: boolean;
  onSend: () => void;
  /** The box is a closed sheet's composer (see `useAskSheet`). */
  compact: boolean;
}

/**
 * The first time the conversation is ready, puts the cursor in the composer
 * and sends a question asked before the box mounted, if it can be sent;
 * either happens at most once.
 */
export function useInitialIntent(
  input: RefObject<HTMLTextAreaElement | null>,
  intent: InitialIntentInput,
): void {
  const { busy, canSend, onSend, compact } = intent;
  const initialIntent = useRef(intent.submitOnReady);
  const initialFocus = useRef(true);
  useEffect(() => {
    if (busy) return;
    if (initialFocus.current) {
      initialFocus.current = false;
      // Only while the conversation is in view: focusing a closed sheet's
      // composer would open it again after the visitor closed it.
      if (document.activeElement === document.body && !compact)
        input.current?.focus({ preventScroll: true });
    }
    if (!initialIntent.current) return;
    initialIntent.current = false;
    if (canSend) onSend();
  }, [busy, canSend, onSend]);
}
