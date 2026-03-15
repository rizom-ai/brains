import { describe, expect, test } from "bun:test";
import { buildAgentCard } from "../src/agent-card";
import type { AnchorProfile, BrainCharacter } from "@brains/plugins";

const mockCharacter: BrainCharacter = {
  name: "Rover",
  role: "Knowledge manager",
  purpose: "Organize and surface knowledge",
  values: ["clarity", "accuracy"],
};

const mockProfile: AnchorProfile = {
  name: "Jan Hein",
};

const mockTools = [
  {
    name: "blog_generate",
    description: "Generate a blog post",
    pluginId: "blog",
  },
  {
    name: "system_search",
    description: "Search knowledge base",
    pluginId: "system",
  },
];

describe("buildAgentCard", () => {
  test("should build card with brain identity", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: mockTools,
    });

    expect(card.name).toBe("Rover");
    expect(card.description).toBe(
      "Rover is Jan Hein's Knowledge manager. Its purpose is: Organize and surface knowledge.",
    );
    expect(card.version).toBe("1.0.0");
    expect(card.protocolVersion).toBe("0.2.2");
  });

  test("should map tools to skills", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: mockTools,
    });

    expect(card.skills).toHaveLength(2);
    expect(card.skills[0]?.id).toBe("blog_generate");
    expect(card.skills[0]?.description).toBe("Generate a blog post");
    expect(card.skills[1]?.id).toBe("system_search");
  });

  test("should use domain for url when provided", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      domain: "yeehaa.io",
      tools: [],
    });

    expect(card.url).toBe("https://yeehaa.io");
  });

  test("should fall back to localhost when no domain", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    expect(card.url).toBe("http://localhost:3334");
  });

  test("should include provider when organization is set", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      organization: "rizom.ai",
      tools: [],
    });

    expect(card.provider?.organization).toBe("rizom.ai");
  });

  test("should omit provider when organization is not set", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    expect(card.provider).toBeUndefined();
  });

  test("should declare streaming capability", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
  });

  test("should handle empty tools list", () => {
    const card = buildAgentCard({
      character: mockCharacter,
      profile: mockProfile,
      version: "1.0.0",
      tools: [],
    });

    expect(card.skills).toHaveLength(0);
  });
});
