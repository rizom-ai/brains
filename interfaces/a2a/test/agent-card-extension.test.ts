import { describe, expect, test } from "bun:test";
import { buildAgentCard } from "../src/agent-card";
import type { AnchorProfile, BrainCharacter } from "@brains/plugins";

const ANCHOR_EXTENSION_URI = "https://rizom.ai/ext/anchor-profile/v1";

const mockCharacter: BrainCharacter = {
  name: "Rover",
  role: "Knowledge manager",
  purpose: "Organize and surface knowledge",
  values: ["clarity", "accuracy"],
};

const mockProfile: AnchorProfile = {
  name: "Jan Hein",
  kind: "professional",
  description: "Founder of Rizom, working on institutional design",
};

describe("Agent Card anchor-profile extension", () => {
  test("should include anchor-profile extension in capabilities", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    const extensions = card.capabilities.extensions;
    expect(extensions).toBeDefined();

    const anchorExt = extensions?.find((e) => e.uri === ANCHOR_EXTENSION_URI);
    expect(anchorExt).toBeDefined();
  });

  test("should include anchor name in extension params", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    const anchorExt = card.capabilities.extensions?.find(
      (e) => e.uri === ANCHOR_EXTENSION_URI,
    );

    expect(anchorExt?.params?.["name"]).toBe("Jan Hein");
  });

  test("should include anchor description when available", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    const anchorExt = card.capabilities.extensions?.find(
      (e) => e.uri === ANCHOR_EXTENSION_URI,
    );

    expect(anchorExt?.params?.["description"]).toBe(
      "Founder of Rizom, working on institutional design",
    );
  });

  test("should include organization from provider when set", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      organization: "Rizom",
      tools: [],
    });

    const anchorExt = card.capabilities.extensions?.find(
      (e) => e.uri === ANCHOR_EXTENSION_URI,
    );

    expect(anchorExt?.params?.["organization"]).toBe("Rizom");
  });

  test("should omit organization when not set", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    const anchorExt = card.capabilities.extensions?.find(
      (e) => e.uri === ANCHOR_EXTENSION_URI,
    );

    expect(anchorExt?.params?.["organization"]).toBeUndefined();
  });

  test("should omit description when profile has none", () => {
    const minimalProfile: AnchorProfile = {
      name: "Test",
      kind: "professional",
    };
    const card = buildAgentCard({
      character: mockCharacter,
      profile: minimalProfile,
      version: "1.0.0",
      tools: [],
    });

    const anchorExt = card.capabilities.extensions?.find(
      (e) => e.uri === ANCHOR_EXTENSION_URI,
    );

    expect(anchorExt?.params?.["name"]).toBe("Test");
    expect(anchorExt?.params?.["description"]).toBeUndefined();
  });

  test("should not mark extension as required", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    const anchorExt = card.capabilities.extensions?.find(
      (e) => e.uri === ANCHOR_EXTENSION_URI,
    );

    expect(anchorExt?.required).toBeUndefined();
  });

  test("should preserve existing capabilities alongside extension", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.capabilities.extensions).toBeDefined();
  });
});
