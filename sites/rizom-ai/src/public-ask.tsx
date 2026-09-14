/** @jsxImportSource react */
import type { JSX } from "react";
import {
  defineSection,
  sectionGroup,
  z,
  type SiteSectionGroup,
} from "@rizom/site";

/** Site-owned composition only; all conversation behavior stays in Web Chat. */
export function PublicAsk(): JSX.Element {
  return (
    <>
      <link rel="stylesheet" href="/ask/assets/app.css" />
      <link rel="stylesheet" href="/ask/assets/page.css" />
      <div
        data-web-chat-root=""
        data-guest-chat=""
        data-guest-name="Rizom AI"
        data-guest-label="Rizom AI"
        data-chat-api-path="/api/chat/guest"
      >
        <p>Connecting to public Ask…</p>
        <noscript>
          JavaScript is needed to ask a question. No question has been sent.
        </noscript>
      </div>
      <script type="module" src="/ask/assets/app.js" />
    </>
  );
}

export const publicAskSections: SiteSectionGroup = sectionGroup("public-ask", {
  conversation: defineSection(z.object({}), PublicAsk, {
    title: "Public Ask",
    description: "The shared guest conversation inside the site's own layout",
  }),
});
