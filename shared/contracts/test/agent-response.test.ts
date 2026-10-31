import { describe, expect, it } from "bun:test";
import {
  AgentResponseSchema,
  parseAgentResponse,
  type ActionsCard,
} from "../src";

describe("shared agent response contract", () => {
  it("preserves explicit failures without inferring them from response text", () => {
    const base = {
      text: "Error: a word used in an explanation",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
    expect(parseAgentResponse(base)).toEqual(base);
    expect(parseAgentResponse({ ...base, error: "Provider failure" })).toEqual({
      ...base,
      error: "Provider failure",
    });
  });
  it("leaves out a malformed card instead of failing the answer", () => {
    const actions: ActionsCard = {
      kind: "actions",
      id: "actions:next",
      actions: [{ type: "event", id: "go", label: "Go", event: "NEXT" }],
    };
    const response = parseAgentResponse({
      text: "Here is the style guide.",
      cards: [
        {
          kind: "sources",
          id: "sources:tool-results",
          sources: [{ id: "style-guide", source: "style-guide", excerpt: "" }],
        },
        actions,
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    expect(response.text).toBe("Here is the style guide.");
    expect(response.cards).toEqual([actions]);
  });
  it("validates runtime agent responses with structured action cards", () => {
    const response = AgentResponseSchema.parse({
      text: "Choose a next step.",
      cards: [
        {
          kind: "actions",
          id: "actions:next",
          title: "Next step",
          defaultOpen: true,
          actions: [
            {
              type: "event",
              id: "continue",
              label: "Keep going",
              event: "NEXT",
            },
          ],
        },
      ],
      toolResults: [
        {
          toolName: "playbook_manage",
          args: { action: "send-event", event: "NEXT" },
          data: { currentState: "identity" },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    expect(response.text).toBe("Choose a next step.");
    expect(response.cards?.[0]?.kind).toBe("actions");
  });

  it("normalizes undefined optional fields at the boundary", () => {
    const response = parseAgentResponse({
      text: "ok",
      cards: [
        {
          kind: "actions",
          id: "actions:next",
          title: undefined,
          defaultOpen: undefined,
          actions: [
            {
              type: "event",
              id: "continue",
              label: "Keep going",
              event: "NEXT",
              description: undefined,
            },
          ],
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    expect(response).toEqual({
      text: "ok",
      cards: [
        {
          kind: "actions",
          id: "actions:next",
          actions: [
            {
              type: "event",
              id: "continue",
              label: "Keep going",
              event: "NEXT",
            },
          ],
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
  });
});
