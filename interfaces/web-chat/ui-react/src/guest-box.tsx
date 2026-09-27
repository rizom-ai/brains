/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import { ASK_SOURCES_EVENT, createChatClient } from "@brains/contracts/chat";
import { askSourcesDetail } from "./ask-sources";
import "./guest-box.css";
import { GuestApp } from "./GuestApp";

/** Each host owns its frame; Web Chat owns public content and the conversation. */
export function mountGuestBox(body: HTMLElement, submitOnReady = false): void {
  const input = body.querySelector("textarea");
  const client = createChatClient({ apiPath: "/api/chat/guest" });
  createRoot(body).render(
    <GuestApp
      client={client}
      box
      initialDraft={input?.value ?? ""}
      initialSubmit={submitOnReady}
      onAnswered={(cards): void => {
        body.dispatchEvent(
          new CustomEvent(ASK_SOURCES_EVENT, {
            bubbles: true,
            detail: askSourcesDetail(cards),
          }),
        );
      }}
    />,
  );
}
