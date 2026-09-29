import { describe, expect, it } from "bun:test";
import {
  AnchorProfileSchema,
  BrainCharacterSchema,
} from "../../src/contracts/identity";
import {
  toPublicAnchorProfile,
  toPublicBrainCharacter,
} from "../../src/base/public-identity";

describe("public identity contracts", () => {
  it("returns detached public identity data without extra runtime fields", () => {
    const characterSource = {
      name: "Relay",
      role: "assistant",
      purpose: "Help",
      values: ["clear"],
      privateRuntime: { replace: (): void => {} },
    };
    const character = toPublicBrainCharacter(characterSource);
    expect(character).not.toHaveProperty("privateRuntime");
    character.values.push("local");
    expect(characterSource.values).toEqual(["clear"]);

    const profileSource = {
      name: "Anchor",
      socialLinks: [
        {
          platform: "github" as const,
          url: "https://github.com/example",
          label: "Original",
          privateRuntime: true,
        },
      ],
      privateRuntime: { replace: (): void => {} },
    };
    const profile = toPublicAnchorProfile(profileSource);
    expect(profile).not.toHaveProperty("privateRuntime");
    const link = profile.socialLinks?.[0];
    if (!link) throw new Error("Missing public social link");
    expect(link).not.toHaveProperty("privateRuntime");
    link.label = "Local";
    profile.name = "Local";
    expect(profileSource.name).toBe("Anchor");
    expect(profileSource.socialLinks[0]?.label).toBe("Original");
  });

  it("maps runtime brain character to the stable public contract", () => {
    const character = toPublicBrainCharacter({
      name: "Relay",
      role: "assistant",
      purpose: "Help with publishing",
      values: ["clear", "useful"],
    });

    expect(BrainCharacterSchema.parse(character)).toEqual({
      name: "Relay",
      role: "assistant",
      purpose: "Help with publishing",
      values: ["clear", "useful"],
    });
  });

  it("maps runtime anchor profile to the stable public contract", () => {
    const profile = toPublicAnchorProfile({
      name: "Yeehaa",
      organization: "Rizom",
      description: "Builder",
      avatar: "https://example.com/avatar.png",
      website: "https://example.com",
      email: "hi@example.com",
      socialLinks: [
        {
          platform: "github",
          url: "https://github.com/rizom-ai",
          label: "GitHub",
        },
      ],
    });

    expect(AnchorProfileSchema.parse(profile)).toEqual({
      name: "Yeehaa",
      organization: "Rizom",
      description: "Builder",
      avatar: "https://example.com/avatar.png",
      website: "https://example.com",
      email: "hi@example.com",
      socialLinks: [
        {
          platform: "github",
          url: "https://github.com/rizom-ai",
          label: "GitHub",
        },
      ],
    });
  });
});
