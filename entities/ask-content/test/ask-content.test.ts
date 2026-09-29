import { describe, expect, test } from "bun:test";
import {
  AskContentPlugin,
  askContentAdapter,
  askContentEntitySchema,
} from "../src";

describe("Ask content entity", () => {
  test("registers as an independent singleton", () => {
    const plugin = new AskContentPlugin();
    expect(plugin.entityType).toBe("ask-content");
    expect(plugin.schema).toBe(askContentEntitySchema);
  });
  test("round trips authored copy through markdown", () => {
    const markdown = askContentAdapter.createContent(
      { title: "Ask", topics: ["Topic"] },
      "Welcome copy.",
    );
    expect(askContentAdapter.parseContent(markdown)).toEqual({
      title: "Ask",
      topics: ["Topic"],
      introduction: "Welcome copy.",
    });
    expect(askContentAdapter.fromMarkdown(markdown).entityType).toBe(
      "ask-content",
    );
  });
  test("round trips the page copy around the conversation", () => {
    const page = {
      topicsHeading: "Where would you start?",
      contactLabel: "Let’s talk",
      contactNote: "A private note. No account needed.",
      attribution: "Written, not generated",
      mapCaption: "Everything published here, placed by topic",
    };
    const markdown = askContentAdapter.createContent(page, "Welcome copy.");
    expect(askContentAdapter.parseContent(markdown)).toEqual({
      ...page,
      introduction: "Welcome copy.",
    });
  });
  test("bounds the page copy", () => {
    expect(() =>
      askContentAdapter.parseContent(
        askContentAdapter.createContent({ contactLabel: "x".repeat(81) }),
      ),
    ).toThrow();
  });
  test("does not manufacture a welcome", () => {
    expect(
      askContentAdapter.parseContent(askContentAdapter.createContent({})),
    ).toEqual({});
  });
});
