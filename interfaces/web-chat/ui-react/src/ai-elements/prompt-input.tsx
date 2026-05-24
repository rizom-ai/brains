/** @jsxImportSource react */
import { forwardRef, type FormEvent, type PropsWithChildren } from "react";
import type { TextareaHTMLAttributes } from "react";

type PromptInputStatus = "submitted" | "streaming" | "ready" | "error";

export function PromptInput({
  children,
  onSubmit,
}: PropsWithChildren<{ onSubmit: () => void }>): React.ReactElement {
  return (
    <form
      className="web-chat-prompt-input"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
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
    </button>
  );
}
