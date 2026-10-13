/** @jsxImportSource react */
import { Button } from "@brains/app-ui-react";
import type { ReactElement } from "react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import type { InterruptedResponse } from "./use-chat-stream";

const INTERRUPTION_LABELS: Record<InterruptedResponse["kind"], string> = {
  stopped: "Stopped",
  disconnected: "Connection lost",
  failed: "Response failed",
};

/**
 * Why a response ended early, and — when the request can be sent again — a
 * way to put it back in the composer for review rather than resending it.
 */
export function StudioChatInterruption(props: {
  interrupted: InterruptedResponse;
  /** The composer holds text or uploads a restored request would replace. */
  draftPending: boolean;
  /** Restoring waits while a response is sending or an upload runs. */
  restoreBlocked: boolean;
  onRestore: (retry: NonNullable<InterruptedResponse["retry"]>) => void;
}): ReactElement {
  const { interrupted } = props;
  return (
    <section
      className={chatClass("studio-chat-interruption", chatLayout.empty)}
      role={interrupted.kind === "stopped" ? "status" : "alert"}
      aria-atomic="true"
    >
      <strong>{INTERRUPTION_LABELS[interrupted.kind]}</strong>
      <p>
        Any received text is kept here. Stopping the response does not undo
        completed actions; the server may still be working.
      </p>
      {interrupted.detail && <p>{interrupted.detail}</p>}
      {interrupted.retry && (
        <>
          <p>
            Sending again may repeat completed actions. Review the request
            before sending.
          </p>
          <Button
            type="button"
            variant="ghost"
            disabled={props.restoreBlocked || props.draftPending}
            onClick={() => {
              if (!interrupted.retry || props.draftPending) return;
              props.onRestore(interrupted.retry);
            }}
          >
            Review retry in composer
          </Button>
          {props.draftPending && (
            <p>
              Your composer draft is unchanged. Send or clear it before
              restoring this request.
            </p>
          )}
        </>
      )}
    </section>
  );
}
