import { describe, it, expect } from "bun:test";
import { createTopicBody, parseTopicBody } from "../../src/lib/topic-body";

describe("topic body", () => {
  it("round-trips a title through frontmatter", () => {
    const body = createTopicBody({
      title: "Human-AI Collaboration",
      content: "How people and models divide work.",
    });

    expect(parseTopicBody(body)).toMatchObject({
      title: "Human-AI Collaboration",
      content: "How people and models divide work.",
    });
  });

  it("strips the legacy Sources section stored entities still carry", () => {
    const body = createTopicBody({
      title: "Messaging Validation",
      content: "Validating resonance.\n\n## Sources\n\n- post/one\n- note/two",
    });

    expect(parseTopicBody(body).content).toBe("Validating resonance.");
  });

  it("renders a body it cannot parse rather than failing the page listing it", () => {
    expect(parseTopicBody("Just prose, no frontmatter.")).toEqual({
      content: "Just prose, no frontmatter.",
      formatted: "Just prose, no frontmatter.",
      title: "Unknown Topic",
    });

    const untitled = "---\nweight: 3\n---\n\nBody.";
    expect(parseTopicBody(untitled).title).toBe("Unknown Topic");
  });
});
