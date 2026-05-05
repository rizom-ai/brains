import { describe, it, expect, mock } from "bun:test";
import { z } from "@brains/utils";
import {
  baseProfileExtension,
  fetchAnchorProfile,
} from "../src/profile-helpers";

// ---- baseProfileExtension ----

describe("baseProfileExtension", () => {
  it("should parse all optional fields", () => {
    const result = baseProfileExtension.parse({
      tagline: "Sweet thoughts",
      intro: "A curious unicorn",
      story: "Once upon a time...",
    });
    expect(result.tagline).toBe("Sweet thoughts");
    expect(result.intro).toBe("A curious unicorn");
    expect(result.story).toBe("Once upon a time...");
  });

  it("should accept empty object (all fields optional)", () => {
    const result = baseProfileExtension.parse({});
    expect(result.tagline).toBeUndefined();
    expect(result.intro).toBeUndefined();
    expect(result.story).toBeUndefined();
  });

  it("should be extendable with additional fields", () => {
    const extended = baseProfileExtension.extend({
      expertise: z.array(z.string()).optional(),
    });
    const result = extended.parse({
      tagline: "hello",
      expertise: ["TypeScript", "Rust"],
    });
    expect(result.tagline).toBe("hello");
    expect(result.expertise).toEqual(["TypeScript", "Rust"]);
  });
});

// ---- fetchAnchorProfile ----

describe("fetchAnchorProfile", () => {
  it("should fetch entity and return raw content", async () => {
    const entityService = {
      listEntities: mock(() =>
        Promise.resolve([
          { id: "anchor-profile", content: "---\nname: Test\n---\nBody here" },
        ]),
      ),
    };

    const content = await fetchAnchorProfile(entityService as never);
    expect(content).toBe("---\nname: Test\n---\nBody here");
    expect(entityService.listEntities).toHaveBeenCalledWith({
      entityType: "anchor-profile",
      options: { limit: 1 },
    });
  });

  it("should throw when no profile entity exists", async () => {
    const entityService = {
      listEntities: mock(() => Promise.resolve([])),
    };

    expect(fetchAnchorProfile(entityService as never)).rejects.toThrow(
      "Profile not found",
    );
  });
});
