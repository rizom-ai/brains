/** @jsxImportSource react */
import { forwardRef, type PropsWithChildren } from "react";
import type { TextareaHTMLAttributes } from "react";

type PromptInputStatus = "submitted" | "streaming" | "ready" | "error";

export function PromptInput({
  children,
  onSubmit,
}: PropsWithChildren<{ onSubmit: () => void }>): React.ReactElement {
  return (
    <form
      className="web-chat-prompt-input"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function PromptInputTextarea(props, ref): React.ReactElement {
  return <textarea ref={ref} className="web-chat-prompt-textarea" {...props} />;
});

export function PromptInputFooter({
  children,
}: PropsWithChildren): React.ReactElement {
  return <div className="web-chat-prompt-footer">{children}</div>;
}

export function PromptInputHint(): React.ReactElement {
  return (
    <span className="web-chat-prompt-hint">
      <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> newline
    </span>
  );
}

function SendIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 18 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d="M2 7h10M9 3c1.5 2 3 4 5 4-2 0-3.5 2-5 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="2" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PromptInputSubmit({
  disabled = false,
  onStop,
  status,
}: {
  disabled?: boolean;
  onStop: () => void;
  status: PromptInputStatus;
}): React.ReactElement {
  const busy = status === "submitted" || status === "streaming";
  if (busy) {
    return (
      <button
        aria-label="Stop response"
        className="web-chat-prompt-submit"
        type="button"
        onClick={onStop}
      >
        Stop
      </button>
    );
  }

  return (
    <button
      aria-label="Send message"
      className="web-chat-prompt-submit"
      type="submit"
      disabled={disabled}
    >
      Send
      <SendIcon />
    </button>
  );
}
