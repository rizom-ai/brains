/** @jsxImportSource react */
import {
  useLayoutEffect,
  useRef,
  type ReactElement,
  type RefObject,
} from "react";
import type { GuestBoxState } from "./guest-box-types";

interface GuestBoxNoticeCopy {
  title: string;
  body: string;
  /** Offer to start a separate question. */
  fresh?: true;
  /** Offer to check whether chat is available again. */
  availability?: true;
}

/** What the box tells the visitor in each state that needs a word. */
const GUEST_BOX_NOTICES: Partial<Record<GuestBoxState, GuestBoxNoticeCopy>> = {
  incomplete: {
    title: "The connection dropped.",
    body: "Your answer may still be finishing. Checking won’t repeat your question.",
    fresh: true,
  },
  uncertain: {
    title: "Connection lost.",
    body: "We can’t confirm whether your question was received. It’s still here, and we won’t send it again.",
    fresh: true,
  },
  limit: {
    title: "No more questions can be sent right now.",
    body: "A chat limit was reached, or another question is still running. Your visible text stays here.",
  },
  unavailable: {
    title: "Chat isn’t available right now.",
    body: "You can keep writing. Checking availability won’t send your question.",
    availability: true,
  },
  expired: {
    title: "This conversation is unavailable.",
    body: "You can still read what’s visible here. Starting separately won’t restore or repeat the previous question.",
    fresh: true,
  },
  ended: {
    title: "The previous request ended without a complete answer.",
    body: "Your visible text is preserved. You can write a new question.",
  },
};

export function GuestBoxNotice(props: {
  state: GuestBoxState;
  busy: boolean;
  canCheck: boolean;
  freshButtonRef: RefObject<HTMLButtonElement | null>;
  onCheck: () => void;
  onAvailability: () => void;
  onFresh: () => void;
}): ReactElement | null {
  const notice = GUEST_BOX_NOTICES[props.state];
  if (!notice) return null;
  return (
    <section className="brain-box-notice" role="status" aria-live="polite">
      <h3>{notice.title}</h3>
      <p>{notice.body}</p>
      <div className="brain-box-actions">
        {props.canCheck && (
          <button
            type="button"
            className="brain-box-action"
            disabled={props.busy}
            onClick={props.onCheck}
          >
            Check answer
          </button>
        )}
        {notice.fresh && (
          <button
            ref={props.freshButtonRef}
            type="button"
            className="brain-box-action"
            disabled={props.busy}
            onClick={props.onFresh}
          >
            New question
          </button>
        )}
        {notice.availability && (
          <button
            type="button"
            className="brain-box-action"
            disabled={props.busy}
            onClick={props.onAvailability}
          >
            Check availability
          </button>
        )}
      </div>
    </section>
  );
}

/** Asks before starting a separate question; focuses Continue when shown. */
export function GuestBoxFreshConfirmation(props: {
  busy: boolean;
  onContinue: () => void;
  onBack: () => void;
}): ReactElement {
  const confirmation = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    confirmation.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="brain-box-notice">
      <h3>Start a separate question?</h3>
      <p>
        The earlier one may still finish. We’ll check availability first. This
        won’t cancel, delete or repeat it, or reset any limit.
      </p>
      <div className="brain-box-actions">
        <button
          ref={confirmation}
          type="button"
          className="brain-box-action"
          disabled={props.busy}
          onClick={props.onContinue}
        >
          Continue
        </button>
        <button
          className="brain-box-quiet"
          disabled={props.busy}
          type="button"
          onClick={props.onBack}
        >
          Go back
        </button>
      </div>
    </section>
  );
}
