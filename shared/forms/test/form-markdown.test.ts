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

  it("is served beneath /forms when its file states no path, or an empty one", () => {
    const pathless = parseFormMarkdown(
      "brand-test",
      markdown.replace("path: /brand-test\n", ""),
    );
    expect(pathless.path).toBe("/forms/brand-test");
    expect(
      parseFormMarkdown(
        "brand-test",
        markdown.replace("path: /brand-test", "path: ''"),
      ),
    ).toEqual(pathless);
  });
});

// A form's next stored form (docs/plans/one-stored-form.md) is a YAML file:
// its introduction is the intro key, not a body.
describe("a form in its next stored form", () => {
  it("reads its introduction from the intro key", () => {
    const current =
      "---\ntarget: contact-request\ntitle: Work with us\nsteps:\n  - title: You\n    fields:\n      - kind: text\n        id: name\n        label: Name\n---\nTell us what you have in mind.\n";
    const next =
      "---\ntarget: contact-request\ntitle: Work with us\nsteps:\n  - title: You\n    fields:\n      - kind: text\n        id: name\n        label: Name\nintro: Tell us what you have in mind.\n---\n";
    expect(parseFormMarkdown("work", next)).toEqual(
      parseFormMarkdown("work", current),
    );
  });
});
