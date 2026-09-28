/** @jsxImportSource react */
import { useLayoutEffect, useRef, type ReactElement } from "react";
import type { GuestChatSessionResponse } from "@brains/contracts/chat";

/** Provider and retention facts for the box; focuses Close when opened. */
export function GuestBoxAbout(props: {
  session: GuestChatSessionResponse | undefined;
  onClose: () => void;
}): ReactElement {
  const { session } = props;
  const close = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="brain-box-privacy" aria-label="About this chat">
      <h3>Before you send</h3>
      {session ? (
        <>
          <p>{session.notice}</p>
          <p>Provider: {session.provider}</p>
          <p>
            Visitor access expires{" "}
            {new Date(session.expiresAt).toLocaleString()}. Conversation
            retention: idle limit {session.retention.idleSeconds / 3600} hours;
            maximum age {session.retention.maxAgeSeconds / 3600} hours.
          </p>
          <p>{session.deletionLimitations}</p>
        </>
      ) : (
        <p>
          Chat is not ready. Provider and retention information will be shown
          here before sending is available.
        </p>
      )}
      <button
        type="button"
        ref={close}
        className="brain-box-quiet"
        onClick={props.onClose}
      >
        Close
      </button>
    </section>
  );
}
