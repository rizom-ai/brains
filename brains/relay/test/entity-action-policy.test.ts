import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import relayBrain from "../src/index";

describe("Relay entity action policy", () => {
  it("only loosens explicit team-authored entity types for collaborators", () => {
    const config = resolve(relayBrain, {}, { mode: "eval" });
    const policy = config.permissions?.entityActions;

    expect(policy?.["*"]).toEqual({
      create: "anchor",
      update: "anchor",
      delete: "anchor",
      extract: "anchor",
      publish: "anchor",
    });

    for (const entityType of [
      "note",
      "link",
      "decision",
      "action-item",
      "doc",
      "deck",
      "image",
    ]) {
      expect(policy?.[entityType]).toEqual({
        create: "trusted",
        update: "trusted",
        delete: "anchor",
      });
    }

    for (const entityType of [
      "summary",
      "topic",
      "agent",
      "skill",
      "swot",
      "prompt",
      "site-info",
      "site-content",
      "brain-character",
      "anchor-profile",
    ]) {
      expect(policy?.[entityType]).toBeUndefined();
    }
  });
});
