import { describe, expect, it } from "bun:test";
import { getAgentDiscoveryInstructions } from "../src/lib/agent-instructions";

describe("getAgentDiscoveryInstructions", () => {
  it("treats asking what a saved agent has to say as an A2A contact request", () => {
    const instructions = getAgentDiscoveryInstructions();

    expect(instructions).toContain("what does <agent> have to say");
    expect(instructions).toContain("use `a2a_call`");
    expect(instructions).toContain(
      "rather than answering from local saved agent metadata",
    );
    expect(instructions).toContain(
      "a follow-up like `what skills does it have`",
    );
    expect(instructions).toContain(
      "even if the previous remote response was a refusal or error",
    );
  });

  it("keeps save-first refusals from mentioning wishlist fallback internals", () => {
    const instructions = getAgentDiscoveryInstructions();

    expect(instructions).toContain(
      "Do not mention wishes, wishlist, backlog, or fallback entities in that response.",
    );
  });

  it("does not apply agent save-first refusal to explicit link/bookmark saves", () => {
    const instructions = getAgentDiscoveryInstructions();

    expect(instructions).toContain(
      "Explicit link or bookmark saves like `save this link: https://example.com/page` are not agent-contact requests",
    );
    expect(instructions).toContain(
      'use `system_create({ entityType: "link", source: { kind: "url", url: "https://example.com/page" } })`',
    );
  });

  it("treats bare affirmative follow-ups after save-first refusal as consent to save", () => {
    const instructions = getAgentDiscoveryInstructions();

    expect(instructions).toContain("Yes please");
    expect(instructions).toContain(
      'system_create({ entityType: "agent", source: { kind: "url", url: "save-first-followup.example" } })',
    );
    expect(instructions).toContain("return an empty response");
  });
});
