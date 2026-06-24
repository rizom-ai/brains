import { describe, expect, it } from "bun:test";
import { AgentResponseSchema, parseAgentResponse } from "../src";

describe("shared agent response contract", () => {
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
          toolName: "playbook_send_event",
          args: { event: "NEXT" },
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
