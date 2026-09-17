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
  test("does not manufacture a welcome", () => {
    expect(
      askContentAdapter.parseContent(askContentAdapter.createContent({})),
    ).toEqual({});
  });
});
