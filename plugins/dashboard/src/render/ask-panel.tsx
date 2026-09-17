/** @jsxImportSource react */
import type { JSX } from "react";
import { OperatorPanel, OperatorSection } from "@brains/operator-view-react";

/** Host chrome only. Guest admission and the mounted conversation belong to Web Chat. */
export function AskPanel(): JSX.Element {
  return (
    <OperatorSection
      id="ask"
      className="dashboard-tab-panel"
      data-dashboard-tab-panel
      data-ui-panel="ask"
      role="tabpanel"
      aria-labelledby="dashboard-tab-ask"
    >
      <OperatorPanel className="card dashboard-ask" heading="Ask">
        <div data-guest-dashboard="">
          <p>Chat is unavailable until the public Ask interface is loaded.</p>
          <noscript>
            JavaScript is needed to ask a question. No question has been sent.
          </noscript>
        </div>
      </OperatorPanel>
      <link rel="stylesheet" href="/ask/assets/dashboard.css" />
      <script type="module" src="/ask/assets/dashboard.js" />
    </OperatorSection>
  );
}
