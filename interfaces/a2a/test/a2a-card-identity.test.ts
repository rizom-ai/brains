import { describe, expect, test } from "bun:test";
import { buildAgentCard } from "../src/agent-card";
import type { AnchorProfile, BrainCharacter } from "@brains/plugins";

/**
 * Regression: Agent Card shows "Unknown" as anchor name.
 *
 * Timeline:
 * 1. Shell creates AnchorProfileService with default { name: "Unknown" }
 * 2. Initial sync imports profile data
 * 3. Bootloader initializes profile service from DB
 *    → getProfile() now returns "Jan Hein"
 * 4. A2A onReady builds the Agent Card from initialized services
 *
 * The fix must build the card from the ready lifecycle, after the profile service initializes.
 * entity:created/updated won't help because the entity already exists —
 * the issue is that the service cache hasn't been populated yet.
 */
describe("Agent Card identity timing", () => {
  test("card shows 'Unknown' when profile service has not initialized", () => {
    // This is what used to happen before ready-state initialization.
    const uninitializedProfile: AnchorProfile = {
      name: "Unknown",
      kind: "professional",
    };
    const defaultCharacter: BrainCharacter = {
      name: "Brain",
      role: "Knowledge assistant",
      purpose: "Help organize and retrieve information",
      values: ["clarity"],
    };

    const card = buildAgentCard({
      character: defaultCharacter,
      profile: uninitializedProfile,
      version: "1.0.0",
      tools: [],
    });

    // Bug: this is what gets served at /.well-known/agent-card.json
    expect(card.description).toContain("Unknown's");
    expect(card.capabilities.extensions?.[0]?.params?.["name"]).toBe("Unknown");
  });

  test("card shows real name when profile service has initialized", () => {
    // This is what A2A should use when onReady builds the card.
    const initializedProfile: AnchorProfile = {
      name: "Jan Hein",
      kind: "professional",
      description: "Builder of things",
    };
    const realCharacter: BrainCharacter = {
      name: "Rover",
      role: "Knowledge manager",
      purpose: "Organize and surface knowledge",
      values: ["clarity", "accuracy"],
    };

    const card = buildAgentCard({
      character: realCharacter,
      profile: initializedProfile,
      version: "1.0.0",
      tools: [],
    });

    expect(card.description).toContain("Jan Hein");
    expect(card.description).not.toContain("Unknown");
    expect(card.capabilities.extensions?.[0]?.params?.["name"]).toBe(
      "Jan Hein",
    );
  });
});
