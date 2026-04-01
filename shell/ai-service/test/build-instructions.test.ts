import { describe, it, expect } from "bun:test";
import { buildInstructions } from "../src/brain-agent";

const identity = {
  name: "Rover",
  role: "Knowledge assistant",
  purpose: "Help organize knowledge",
  values: ["clarity"],
};

describe("buildInstructions", () => {
  it("should include identity in system prompt", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain("# Rover");
    expect(instructions).toContain("Knowledge assistant");
    expect(instructions).toContain("Help organize knowledge");
    expect(instructions).toContain("clarity");
  });

  it("should include profile when provided", () => {
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

  it("should not include profile section when profile is undefined", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).not.toContain("Your Anchor");
  });

  it("should not reference system_get-identity or system_get-profile tools", () => {
    const instructions = buildInstructions(identity, "anchor", undefined, {
      name: "Jan Hein",
      kind: "professional" as const,
      description: "Builder",
    });
    expect(instructions).not.toContain("system_get-identity");
    expect(instructions).not.toContain("system_get-profile");
  });

  it("should include anchor name in user context for anchor users", () => {
    const instructions = buildInstructions(identity, "anchor", undefined, {
      name: "Jan Hein",
      kind: "professional" as const,
      description: "Builder",
    });
    expect(instructions).toContain("Jan Hein");
    expect(instructions).toContain("ANCHOR");
  });

  it("should show trusted user context for trusted users", () => {
    const instructions = buildInstructions(identity, "trusted");
    expect(instructions).toContain("trusted user");
  });

  it("should show public user context for public users", () => {
    const instructions = buildInstructions(identity, "public");
    expect(instructions).toContain("public user");
  });
});
