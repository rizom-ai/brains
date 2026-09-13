/** @jsxImportSource react */
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@brains/app-ui-react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import { libraryStyles } from "./studio-library.styles";

const NARROW_QUERY = "(max-width: 860px)";

/**
 * Keep narrow-screen context out of the conversation's vertical space.
 * CSS may blur a hidden control before the media event; blur handlers bridge
 * focus to the visible presentation without waiting for that event.
 */
export function StudioChatWorkingSetDisclosure(props: {
  contextKey: string | null;
  children: ReactNode;
}): ReactElement {
  const [narrow, setNarrow] = useState(false);
  const [inlineOpen, setInlineOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const summary = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY);
    const update = (): void => {
      if (
        media.matches &&
        summary.current?.parentElement?.contains(document.activeElement)
      )
        trigger.current?.querySelector("button")?.focus();
      if (
        !media.matches &&
        document.activeElement === trigger.current?.querySelector("button")
      )
        summary.current?.focus();
      setNarrow(media.matches);
      if (!media.matches) setDialogOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return (): void => media.removeEventListener("change", update);
  }, []);

  useEffect(() => setDialogOpen(false), [props.contextKey]);

  return (
    <div
      className={chatClass(
        "studio-chat-working-set-control",
        chatLayout.context,
      )}
    >
      <details
        className={chatClass(
          "studio-chat-working-set",
          chatLayout.desktopContext,
        )}
        open={inlineOpen}
        onBlurCapture={(event) => {
          if (
            event.relatedTarget === null &&
            window.matchMedia(NARROW_QUERY).matches
          )
            trigger.current?.querySelector("button")?.focus();
        }}
        onToggle={(event) => setInlineOpen(event.currentTarget.open)}
      >
        <summary
          ref={summary}
          className={chatClass(
            "studio-chat-working-set-summary",
            chatLayout.summary,
          )}
        >
          Working set
        </summary>
        {!narrow && props.children}
      </details>
      <span
        ref={trigger}
        onBlurCapture={(event) => {
          if (
            event.relatedTarget === null &&
            !window.matchMedia(NARROW_QUERY).matches
          )
            summary.current?.focus();
        }}
        className={chatClass(
          "studio-chat-working-set-mobile",
          chatLayout.mobileSessions,
        )}
      >
        <Button
          className="studio-chat-working-set-trigger"
          variant="ghost"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          onClick={() => setDialogOpen(true)}
        >
          Working set
        </Button>
      </span>
      <Dialog open={narrow && dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={chatClass(
            "studio-chat-working-set-dialog",
            libraryStyles.readable,
          )}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // A closing portal can retain its pre-resize render's callback.
            (window.matchMedia(NARROW_QUERY).matches
              ? trigger.current?.querySelector("button")
              : summary.current
            )?.focus();
          }}
        >
          <DialogTitle>Working set</DialogTitle>
          {props.children}
        </DialogContent>
      </Dialog>
    </div>
  );
}
