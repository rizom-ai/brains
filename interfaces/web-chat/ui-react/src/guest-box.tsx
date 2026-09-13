/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import { createChatClient } from "@brains/contracts/chat";
import { z } from "@brains/utils/zod";
import { GuestApp } from "./GuestApp";

/** Enhance only the existing talk-body; keep the site's frame and authored copy. */
export function mountGuestBox(body: HTMLElement, submitOnReady = false): void {
  const input = body.querySelector("textarea");
  const copy = z
    .object({
      title: z.string().min(1).max(500),
      notice: z.string().max(4000),
      inputHint: z.string().max(500),
      topicsLabel: z.string().max(500),
      topics: z.array(z.string().min(1).max(500)).max(20),
    })
    .parse({
      title: body.querySelector("h2")?.textContent,
      notice: body.querySelector(".chat-notice")?.textContent,
      inputHint: input?.placeholder,
      topicsLabel: body
        .querySelector(".hints")
        ?.getAttribute("data-topics-label"),
      topics: [...body.querySelectorAll("[data-chat-topic]")].map(
        (topic) => topic.textContent,
      ),
    });
  const client = createChatClient({ apiPath: "/api/chat/guest" });
  createRoot(body).render(
    <GuestApp
      client={client}
      box={copy}
      initialDraft={input?.value ?? ""}
      initialSubmit={submitOnReady}
    />,
  );
}
