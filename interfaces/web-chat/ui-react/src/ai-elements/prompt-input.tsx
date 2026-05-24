/** @jsxImportSource react */
import type {
  FormEvent,
  PropsWithChildren,
  TextareaHTMLAttributes,
} from "react";

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

export function PromptInputTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
): React.ReactElement {
  return <textarea className="web-chat-prompt-textarea" {...props} />;
}

export function PromptInputSubmit({
  status,
}: {
  status: PromptInputStatus;
}): React.ReactElement {
  const busy = status === "submitted" || status === "streaming";
  return (
    <button className="web-chat-prompt-submit" type="submit" disabled={busy}>
      {busy ? "Thinking…" : "Send"}
    </button>
  );
}
