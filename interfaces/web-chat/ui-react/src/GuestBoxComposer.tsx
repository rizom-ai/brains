/** @jsxImportSource react */
import {
  useLayoutEffect,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import type { GuestBoxCopy } from "./guest-box-types";

/** The box's question form: an autosizing field and its hint. */
export function GuestBoxComposer(props: {
  copy: GuestBoxCopy;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: (value: string) => void;
  /** Characters past the session's limit; positive blocks sending. */
  over: number;
  welcome: boolean;
  busy: boolean;
  canSend: boolean;
  onSubmit: () => void;
  onFocus?: () => void;
  /** A finger or pointer landed on the field, before it takes focus. */
  onLand?: () => void;
  /** Beside the note under the composer, e.g. what the chat is about. */
  noteAction?: ReactNode;
}): ReactElement {
  const { draft, over, welcome, busy, copy } = props;

  useLayoutEffect(() => {
    const composer = props.inputRef.current;
    if (!composer) return;
    composer.style.height = "40px";
    composer.style.height = `${Math.min(composer.scrollHeight || 40, window.innerWidth <= 650 ? 72 : 112)}px`;
  }, [draft]);

  return (
    <form
      onSubmit={(event): void => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <div className="prompt-row">
        <textarea
          ref={props.inputRef}
          rows={1}
          value={draft}
          aria-label={
            welcome ? copy.title || "Your question" : "Your follow-up"
          }
          aria-describedby="brain-chat-notice"
          aria-invalid={over > 0}
          placeholder={welcome ? copy.inputHint : "Ask a follow-up…"}
          onInput={(event): void => props.setDraft(event.currentTarget.value)}
          onFocus={props.onFocus}
          onTouchStart={props.onLand}
          onMouseDown={props.onLand}
          onKeyDown={(event): void => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              props.onSubmit();
            }
          }}
        />
        <button
          className="send"
          type="submit"
          aria-label="Send question"
          disabled={!props.canSend || busy || over > 0 || !draft.trim()}
        >
          ↑
        </button>
      </div>
      <div className="brain-box-note">
        <p
          id="brain-chat-notice"
          className={`brain-box-hint${over > 0 ? " invalid" : ""}`}
        >
          {over > 0
            ? `${over} characters over the limit.`
            : "Answers use published work only. Leave private details out."}
        </p>
        {props.noteAction}
      </div>
    </form>
  );
}
