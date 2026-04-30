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
      kind: "professional",
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
      kind: "professional",
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
