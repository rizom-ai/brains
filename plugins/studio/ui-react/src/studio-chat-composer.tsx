/** @jsxImportSource react */
import { messageUploadAccept } from "@brains/plugins/message-interface/upload-policy";
import { Button } from "@brains/app-ui-react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import { type ChatUploadResponse } from "@brains/contracts/chat";
import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { CHAT_UPLOAD_GUIDANCE } from "./studio-chat-contracts";
import type { ChatUploadAttempt } from "./studio-chat-contracts";

export function Composer(props: {
  locked: boolean;
  onRemoveUpload: (id: string) => void;
  draft: string;
  uploads: ChatUploadResponse[];
  uploadAttempts: ChatUploadAttempt[];
  onRetryUpload: (attempt: ChatUploadAttempt) => void;
  onDismissUpload: (id: string) => void;
  sending: boolean;
  uploading: boolean;
  onDraft: (value: string) => void;
  onFiles: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop?: (() => void) | undefined;
  onJumpToLatest?: (() => void) | undefined;
}): ReactElement {
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };
  return (
    <footer className={chatClass("studio-chat-composer", chatLayout.composer)}>
      {props.onJumpToLatest && (
        <Button type="button" variant="ghost" onClick={props.onJumpToLatest}>
          Jump to latest ↓
        </Button>
      )}
      <form
        className={chatClass("studio-chat-composer-form", chatLayout.form)}
        onSubmit={props.onSubmit}
      >
        {(props.uploadAttempts.length > 0 || props.uploads.length > 0) && (
          <div
            className={chatClass(
              "studio-chat-upload-strip",
              chatLayout.uploadStrip,
            )}
            role="region"
            aria-label="Draft attachments"
            tabIndex={0}
          >
            <ul
              className={chatClass(
                "studio-chat-upload-list",
                chatLayout.uploadList,
              )}
              aria-label={
                props.uploadAttempts.length > 0
                  ? "File upload progress"
                  : "Attached files"
              }
            >
              {props.uploadAttempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className={chatClass("studio-chat-upload", chatLayout.upload)}
                >
                  <div className={chatClass("", chatLayout.uploadName)}>
                    <span
                      role={attempt.status === "failed" ? "alert" : "status"}
                    >
                      {attempt.file.name}:{" "}
                      {attempt.status === "uploading"
                        ? "Uploading…"
                        : (attempt.error ?? "Upload failed")}
                    </span>
                    {attempt.status === "uploading" && (
                      <progress aria-label={`Uploading ${attempt.file.name}`} />
                    )}
                  </div>
                  {attempt.status === "failed" && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        xstyle={chatLayout.toolbarButton}
                        aria-label={`Retry uploading ${attempt.file.name}`}
                        disabled={
                          props.uploading || props.sending || props.locked
                        }
                        onClick={() => props.onRetryUpload(attempt)}
                      >
                        Retry
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        xstyle={chatLayout.toolbarButton}
                        aria-label={`Dismiss failed upload ${attempt.file.name}`}
                        onClick={() => props.onDismissUpload(attempt.id)}
                      >
                        ×
                      </Button>
                    </>
                  )}
                </li>
              ))}
              {props.uploads.map((upload) => (
                <li
                  className={chatClass("studio-chat-upload", chatLayout.upload)}
                  key={upload.id}
                >
                  <DraftUploadPreview upload={upload} />
                  <span className={chatClass("", chatLayout.uploadName)}>
                    {upload.filename}
                    <br />
                    Ready · draft only
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={chatLayout.toolbarButton}
                    aria-label={`Remove ${upload.filename} from message`}
                    disabled={props.locked}
                    onClick={() => props.onRemoveUpload(upload.id)}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <textarea
          className={chatClass("studio-chat-message", chatLayout.input)}
          aria-label="Message"
          aria-describedby="studio-chat-composer-hint"
          placeholder="Message…"
          value={props.draft}
          disabled={props.locked}
          onChange={(event) => props.onDraft(event.target.value)}
          onKeyDown={keyDown}
        />
        <div
          className={chatClass(
            "studio-chat-composer-actions",
            chatLayout.composerBar,
          )}
        >
          <label
            className={chatClass(
              "studio-chat-composer-action",
              chatLayout.attachButton,
            )}
            title={CHAT_UPLOAD_GUIDANCE}
          >
            <span aria-hidden="true">+</span>
            <input
              className={chatClass(
                "studio-chat-upload-input",
                chatLayout.uploadInput,
              )}
              aria-label="Attach files"
              type="file"
              accept={messageUploadAccept}
              multiple
              disabled={props.locked || props.sending || props.uploading}
              onChange={(event) => void props.onFiles(event)}
            />
          </label>
          {props.uploadAttempts.length > 0 && (
            <span className={chatClass("", chatLayout.kicker)}>
              Resolve uploads before sending
            </span>
          )}
          {props.locked ? (
            <Button type="button" disabled>
              Archiving…
            </Button>
          ) : props.sending ? (
            <Button
              type="button"
              variant="outline"
              xstyle={chatLayout.toolbarButton}
              onClick={props.onStop}
              disabled={!props.onStop}
              title="Stop receiving the response. Completed actions are not undone."
            >
              Stop
            </Button>
          ) : (
            <Button
              className="studio-chat-composer-action"
              type="submit"
              xstyle={chatLayout.toolbarButton}
              aria-label="Send message"
              disabled={
                props.uploading ||
                props.uploadAttempts.length > 0 ||
                (!props.draft.trim() && props.uploads.length === 0)
              }
            >
              ↑
            </Button>
          )}
        </div>
      </form>
      <small
        id="studio-chat-composer-hint"
        className={chatClass(
          "studio-chat-composer-hint",
          chatLayout.composerHint,
        )}
      >
        Enter to send · Shift+Enter for a new line
      </small>
    </footer>
  );
}

function DraftUploadPreview({
  upload,
}: {
  upload: ChatUploadResponse;
}): ReactElement | null {
  const [failed, setFailed] = useState(false);
  if (failed || !upload.mediaType.startsWith("image/")) return null;
  return (
    <img
      className={chatClass(
        "studio-chat-draft-preview",
        chatLayout.uploadPreview,
      )}
      src={upload.url}
      alt={upload.filename}
      onError={() => setFailed(true)}
    />
  );
}
