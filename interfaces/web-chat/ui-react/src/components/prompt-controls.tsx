/** @jsxImportSource react */
import type { ChatStatus } from "ai";
import {
  PromptInputSubmit,
  usePromptInputAttachments,
} from "../ai-elements/prompt-input";

export function PromptAttachmentButton(): React.ReactElement {
  const attachments = usePromptInputAttachments();
  return (
    <button
      type="button"
      className="web-chat-prompt-attach"
      onClick={() => attachments.openFileDialog()}
    >
      Attach file
    </button>
  );
}

export function PromptAttachmentList(): React.ReactElement | null {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <div className="web-chat-prompt-attachments" aria-label="Attached files">
      {attachments.files.map((file) => (
        <span className="web-chat-prompt-attachment" key={file.id}>
          <span>{file.filename ?? "upload.txt"}</span>
          <button
            type="button"
            aria-label={`Remove ${file.filename ?? "uploaded file"}`}
            onClick={() => attachments.remove(file.id)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function PromptSubmitControl({
  input,
  onStop,
  status,
}: {
  input: string;
  onStop: () => void;
  status: ChatStatus;
}): React.ReactElement {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputSubmit
      status={status}
      onStop={onStop}
      disabled={!input.trim() && attachments.files.length === 0}
    />
  );
}
