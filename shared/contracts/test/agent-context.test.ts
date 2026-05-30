import { describe, expect, it } from "bun:test";
import {
  parseAgentContextItems,
  type AgentContextItem,
} from "../src/agent-context";

const validItem: AgentContextItem = {
  id: "summary-1",
  source: "conversation-memory",
  title: "summary from #general",
  content: "Team agreed to ship the relay preset.",
  provenance: { entityType: "summary", spaceId: "discord:1" },
};

describe("parseAgentContextItems", () => {
  it("returns valid items unchanged", () => {
    const items = parseAgentContextItems({ items: [validItem] });
    expect(items).toEqual([validItem]);
  });

  it("drops a single malformed item instead of discarding the whole batch", () => {
    const items = parseAgentContextItems({
      items: [validItem, { ...validItem, id: "summary-2", content: "" }],
    });
    expect(items).toEqual([validItem]);
  });

  it("returns [] for a non-object payload", () => {
    expect(parseAgentContextItems(null)).toEqual([]);
    expect(parseAgentContextItems("nope")).toEqual([]);
  });

  it("defaults missing items to an empty array", () => {
    expect(parseAgentContextItems({})).toEqual([]);
  });
});
