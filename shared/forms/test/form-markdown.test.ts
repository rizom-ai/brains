import { describe, expect, it } from "bun:test";
import {
  formDefinitionSchema,
  formFrontmatterSchema,
  formMarkdown,
  parseFormMarkdown,
} from "../src";

const markdown = `---
target: quiz-result
path: /brand-test
title: Brand test
steps:
  - fields:
      - kind: text
        id: name
        label: Name
---
Twenty-four questions about your brand.

Take your time.
`;

describe("a form in the brain's content", () => {
  it("is its entity's id, its frontmatter and its intro", () => {
    expect(parseFormMarkdown("brand-test", markdown)).toEqual(
      formDefinitionSchema.parse({
        id: "brand-test",
        target: "quiz-result",
        path: "/brand-test",
        title: "Brand test",
        intro: "Twenty-four questions about your brand.\n\nTake your time.",
        steps: [{ fields: [{ kind: "text", id: "name", label: "Name" }] }],
      }),
    );
  });

  it("round-trips through markdown, and refuses a definition the engine would not run", () => {
    const form = parseFormMarkdown("brand-test", markdown);
    expect(parseFormMarkdown("brand-test", formMarkdown(form))).toEqual(form);
    expect(() =>
      parseFormMarkdown(
        "brand-test",
        markdown.replace("kind: text", "kind: date"),
      ),
    ).toThrow();
    expect(() => parseFormMarkdown("Brand Test", markdown)).toThrow();
    // The id is the entity's, never the frontmatter's.
    expect(
      formFrontmatterSchema.safeParse({
        id: "x",
        target: "quiz-result",
        title: "x",
        steps: [{ fields: [{ kind: "text", id: "name", label: "Name" }] }],
      }).success,
    ).toBe(false);
  });
});
