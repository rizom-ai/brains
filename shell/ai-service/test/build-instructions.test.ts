import { describe, it, expect } from "bun:test";
import { buildInstructions } from "../src/brain-instructions";

const identity = {
  name: "Rover",
  role: "Knowledge assistant",
  purpose: "Help organize knowledge",
  values: ["clarity"],
};

describe("buildInstructions", () => {
  it("includes identity and permission context", () => {
    const instructions = buildInstructions(identity, "anchor");

    expect(instructions).toContain("# Rover");
    expect(instructions).toContain("Knowledge assistant");
    expect(instructions).toContain("Help organize knowledge");
    expect(instructions).toContain("clarity");
    expect(instructions).toContain("anchor-level operator permissions");
  });

  it("includes profile when provided", () => {
    const instructions = buildInstructions(identity, "anchor", undefined, {
      name: "Jan Hein",
      kind: "professional",
      email: "jan@yeehaa.io",
      website: "https://yeehaa.io",
      description: "Builder of brains",
    });

    expect(instructions).toContain("Your Anchor");
    expect(instructions).toContain("Jan Hein");
    expect(instructions).toContain("jan@yeehaa.io");
    expect(instructions).toContain("https://yeehaa.io");
    expect(instructions).toContain("Builder of brains");
  });

  it("does not include routing instruction sections", () => {
    const instructions = buildInstructions(identity, "anchor");

    expect(instructions).not.toContain("### Core Tools");
    expect(instructions).not.toContain("### Image, OG & Cover Operations");
    expect(instructions).not.toContain("### Multi-Turn Context");
    expect(instructions).not.toContain("### Entity-Specific Update Rules");
    expect(instructions).not.toContain(
      "### CRITICAL: Always Invoke Tools for Actions",
    );
  });

  it("describes the generic tool-first lifecycle for durable actions", () => {
    const instructions = buildInstructions(identity, "anchor");

    expect(instructions).toContain(
      'For direct identity/profile requests, phrase the brain identity as "I am {identity name}" or "I\'m {identity name}"',
    );
    expect(instructions).toContain(
      "For create, update, delete, extract, publish, sync, and other durable actions, call the relevant tool first",
    );
    expect(instructions).toContain(
      "Confirmation requirements are returned by tools and rendered by the host",
    );
  });

  it("keeps profile identity separate from caller identity", () => {
    const instructions = buildInstructions(identity, "public", undefined, {
      name: "Jan Hein",
      kind: "professional" as const,
    });

    expect(instructions).toContain("Public users are not the anchor");
    expect(instructions).toContain(
      "Do not name, volunteer, or disclose the configured anchor/profile identity in that answer",
    );
    expect(instructions).toContain(
      "Do not confirm, deny, reveal, or compare against the configured profile details unless the user separately asks who owns the brain.",
    );
  });

  it("appends brain, plugin, and retrieved-memory instructions", () => {
    const instructions = buildInstructions(
      identity,
      "anchor",
      ["Plugin rule"],
      undefined,
      ["Brain rule"],
      "Relevant conversation memory retrieved for this turn.",
    );

    expect(instructions).toContain("### Brain-Specific Behavior (MANDATORY)");
    expect(instructions).toContain("Brain rule");
    expect(instructions).toContain("### Plugin-Specific Behavior (MANDATORY)");
    expect(instructions).toContain("Plugin rule");
    expect(instructions).toContain(
      "### Retrieved Conversation Memory (CONTEXT)",
    );
    expect(instructions).toContain(
      "Relevant conversation memory retrieved for this turn.",
    );
  });
});
