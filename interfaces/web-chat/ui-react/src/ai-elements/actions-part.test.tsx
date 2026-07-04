import { describe, expect, it } from "bun:test";
import type { EventChatAction } from "@brains/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionsPart } from "./data-parts";

describe("ActionsPart", () => {
  it("renders prompt and event actions as a collapsible list", () => {
    const receivedEventActions: EventChatAction[] = [];
    const markup = renderToStaticMarkup(
      createElement(ActionsPart, {
        data: {
          kind: "actions",
          id: "actions:onboarding",
          title: "Next steps",
          defaultOpen: true,
          actions: [
            {
              type: "prompt",
              id: "review-draft",
              label: "Review draft",
              prompt: "Show me the transformed draft.",
              description: "Ask Rover to open the draft.",
            },
            {
              type: "event",
              id: "continue",
              label: "Continue",
              event: "NEXT",
              fromState: "welcome",
              description: "Request the next playbook transition.",
            },
          ],
        },
        onPromptAction: () => {},
        onEventAction: (action) => {
          receivedEventActions.push(action);
        },
      }),
    );
    expect(receivedEventActions).toEqual([]);

    expect(markup).toContain("<details");
    expect(markup).toContain('open=""');
    expect(markup).toContain("web-chat-actions-card");
    expect(markup).toContain("2 available");
    expect(markup).toContain("Next steps");
    expect(markup).toContain("Review draft");
    expect(markup).toContain("Continue");
    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain('aria-disabled="true"');
  });

  it("falls back to generic data rendering for malformed action payloads", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionsPart, {
        data: {
          kind: "actions",
          id: "actions:bad",
          actions: [],
        },
        onPromptAction: () => {},
        onEventAction: () => {},
      }),
    );

    expect(markup).toContain("web-chat-data-part");
    expect(markup).toContain("data-actions");
  });
});
