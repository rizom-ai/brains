import { describe, expect, it } from "bun:test";
import {
  agentContextAnswerSchema,
  type AgentContextItem,
} from "../src/agent-context";

const validItem: AgentContextItem = {
  id: "summary-1",
  source: "conversation-memory",
  title: "summary from #general",
  content: "Team agreed to ship the relay preset.",
  provenance: { entityType: "summary", spaceId: "discord:1" },
};

describe("agentContextAnswerSchema", () => {
  it("keeps valid items unchanged", () => {
    expect(agentContextAnswerSchema.parse({ items: [validItem] })).toEqual({
      items: [validItem],
    });
  });

  it("drops a single malformed item instead of discarding the whole answer", () => {
    expect(
      agentContextAnswerSchema.parse({
        items: [validItem, { ...validItem, id: "summary-2", content: "" }],
      }),
    ).toEqual({ items: [validItem] });
  });

  it("refuses an answer that is not an object", () => {
    expect(agentContextAnswerSchema.safeParse(null).success).toBe(false);
    expect(agentContextAnswerSchema.safeParse("nope").success).toBe(false);
  });

  it("defaults missing items to an empty array", () => {
    expect(agentContextAnswerSchema.parse({})).toEqual({ items: [] });
  });
});
