/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Button } from "@brains/app-ui-react";
import { getErrorMessage } from "@brains/utils/error";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";

export function StudioChatSessionRename(props: {
  title: string;
  onRename: (title: string) => Promise<void>;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const pendingRequest = useRef(false);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  const trigger = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);
  const finish = (): void => {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() =>
      trigger.current?.querySelector("button")?.focus(),
    );
  };
  const rename = async (): Promise<void> => {
    if (pendingRequest.current || !title.trim()) return;
    pendingRequest.current = true;
    setPending(true);
    setError(null);
    try {
      await props.onRename(title.trim());
      if (mounted.current) finish();
    } catch (cause) {
      if (mounted.current)
        setError(
          getErrorMessage(
            cause,
            "Rename failed. Your proposed title is kept.",
          ) || "Rename failed. Your proposed title is kept.",
        );
    } finally {
      pendingRequest.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <>
      <span ref={trigger}>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={editing}
          disabled={editing}
          onClick={() => {
            setTitle(props.title);
            setEditing(true);
          }}
        >
          Rename
        </Button>
      </span>
      {editing && (
        <form
          className={chatClass(
            "studio-chat-rename",
            chatLayout.sessionControls,
          )}
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
        >
          <label>
            Conversation title
            <input
              ref={input}
              className={chatClass("", chatLayout.sessionFilterInput)}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={48}
              disabled={pending}
            />
          </label>
          <div className={chatClass("", chatLayout.actions)}>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? "Renaming…" : "Save title"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={finish}
            >
              Cancel
            </Button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </>
  );
}
