import { describe, expect, it } from "bun:test";
import {
  DEFAULT_STYLE_GUIDE,
  fetchStyleGuide,
  fetchVoiceGuidance,
} from "../src";

// The style guide lives in entity metadata, decoded from frontmatter on
// import; content carries only the free-text guidance body.
const guideEntity = {
  id: "style-guide",
  content: "Write clearly.",
  metadata: { name: "Test guide", voice: { summary: "Friendly" } },
};

describe("fetchStyleGuide", () => {
  it("returns the default style guide when no entity exists", async () => {
    const requests: unknown[] = [];
    const guide = await fetchStyleGuide({
      getEntity: (request) => {
        requests.push(request);
        return Promise.resolve(null);
      },
    });

    expect(guide).toEqual(DEFAULT_STYLE_GUIDE);
    expect(requests).toEqual([
      { entityType: "style-guide", id: "style-guide" },
    ]);
  });

  it("parses the stored style-guide entity", async () => {
    const guide = await fetchStyleGuide({
      getEntity: () => Promise.resolve(guideEntity),
    });

    expect(guide.name).toBe("Test guide");
    expect(guide.voice?.summary).toBe("Friendly");
    expect(guide.guidance).toBe("Write clearly.");
  });

  it("falls back to the default guide when the reader returns another entity", async () => {
    const guide = await fetchStyleGuide({
      getEntity: () =>
        Promise.resolve({
          id: "sunset-image",
          content: "not a style guide",
          metadata: {},
        }),
    });

    expect(guide).toEqual(DEFAULT_STYLE_GUIDE);
  });
});

describe("fetchVoiceGuidance", () => {
  it("formats the fetched guide's voice facet with the shared body", async () => {
    const guidance = await fetchVoiceGuidance({
      getEntity: () => Promise.resolve(guideEntity),
    });

    expect(guidance).toBe("Voice: Friendly\nWrite clearly.");
  });

  it("returns empty guidance for the default guide", async () => {
    const guidance = await fetchVoiceGuidance({
      getEntity: () => Promise.resolve(null),
    });

    expect(guidance).toBe("");
  });
});
