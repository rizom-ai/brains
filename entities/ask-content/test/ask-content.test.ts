import { describe, expect, test } from "bun:test";
import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import { askContentFrontmatterSchema } from "@brains/contracts";
import askContentPackage, { createAskContent, parseAskContent } from "../src";

/** The entity plugin the package installs, as the canonical brain composes it. */
function askContentPlugin(): EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
> {
  const [plugin] = instantiatePluginPackageDefinition(
    askContentPackage,
    {},
    { name: "@brains/ask-content", version: "0.0.0-test" },
    { pluginId: "ask-content" },
  );
  if (!(plugin instanceof EntityPlugin)) throw new Error("No entity plugin");
  return plugin;
}

describe("Ask content entity", () => {
  test("registers as an independent singleton", () => {
    const plugin = askContentPlugin();
    expect(plugin.id).toBe("ask-content");
    expect(plugin.entityType).toBe("ask-content");
    expect(plugin.adapter.isSingleton).toBe(true);
    expect(plugin.adapter.hasBody).toBe(true);
    expect(plugin.adapter.frontmatterSchema).toBe(askContentFrontmatterSchema);
  });
  test("round trips authored copy through markdown", () => {
    const markdown = createAskContent(
      { title: "Ask", topics: ["Topic"] },
      "Welcome copy.",
    );
    expect(parseAskContent(markdown)).toEqual({
      title: "Ask",
      topics: ["Topic"],
      introduction: "Welcome copy.",
    });
    // The registered type reads the copy as metadata, the welcome as body.
    const read = askContentPlugin().adapter.fromMarkdown(markdown);
    expect(read.metadata).toEqual({ title: "Ask", topics: ["Topic"] });
    expect(read.content?.trim()).toBe("Welcome copy.");
  });
  test("round trips the page copy around the conversation", () => {
    const page = {
      topicsHeading: "Where would you start?",
      contactLabel: "Let’s talk",
      contactNote: "A private note. No account needed.",
      mapCaption: "Everything published here, placed by topic",
      refusal: "I only talk about my work.",
      faqHeading: "Asked before",
    };
    const markdown = createAskContent(page, "Welcome copy.");
    expect(parseAskContent(markdown)).toEqual({
      ...page,
      introduction: "Welcome copy.",
    });
  });
  test("bounds the page copy", () => {
    expect(() =>
      parseAskContent(createAskContent({ contactLabel: "x".repeat(81) })),
    ).toThrow();
  });
  test("does not manufacture a welcome", () => {
    expect(parseAskContent(createAskContent({}))).toEqual({});
  });
});
