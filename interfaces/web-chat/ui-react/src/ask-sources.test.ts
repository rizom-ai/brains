import { describe, expect, it } from "bun:test";
import { askSourcesDetailSchema } from "@brains/contracts/chat";
import { askSourcesDetail } from "./ask-sources";

const card = (sources: unknown[]): unknown => ({
  kind: "sources",
  id: "sources:tool-results",
  sources,
});
const source = (
  entityType: string,
  entityId: string,
  title?: string,
): unknown => ({
  id: `${entityType}:${entityId}`,
  entityType,
  entityId,
  source: entityType,
  ...(title ? { title } : {}),
});

describe("Ask sources detail", () => {
  it("names each source an answer drew on by its entity key, once", () => {
    const detail = askSourcesDetail([
      card([source("post", "hiding", "Hiding in Plain Sight")]),
      card([
        source("post", "hiding", "Hiding in Plain Sight"),
        source("deck", "living"),
      ]),
    ]);
    expect(askSourcesDetailSchema.parse(detail)).toEqual({
      sources: [
        { id: "post:hiding", title: "Hiding in Plain Sight" },
        // Untitled sources are named by their entity id.
        { id: "deck:living", title: "living" },
      ],
    });
  });

  it("ignores anything that is not a guest source card", () => {
    expect(
      askSourcesDetail([{ kind: "text", id: "x" }, card([{ id: "odd" }])]),
    ).toEqual({ sources: [] });
  });
});

describe("Ask sources detail, with the brain a source came from", () => {
  it("carries the brain through when a citation has one", () => {
    const brain = { name: "Becca", url: "https://becca.rizom.ai" };
    const detail = askSourcesDetail([
      card([
        source("post", "hiding", "Hiding"),
        {
          id: "post:handoffs",
          entityType: "post",
          entityId: "handoffs",
          source: "post",
          title: "Handoffs",
          brain,
        },
      ]),
    ]);
    expect(askSourcesDetailSchema.parse(detail).sources).toEqual([
      { id: "post:hiding", title: "Hiding" },
      {
        id: "post:handoffs",
        title: "Handoffs",
        brain: { name: "Becca", url: "https://becca.rizom.ai/" },
      },
    ]);
  });
});
