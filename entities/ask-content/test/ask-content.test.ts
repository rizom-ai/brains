import { describe, expect, test } from "bun:test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { askContentFrontmatterSchema } from "@brains/contracts";
import askContentPackage, { createAskContent, parseAskContent } from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

/** The entity plugin the package installs, as the canonical brain composes it. */
function askContentPlugin(): DeclaredEntityTypePlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    askContentPackage,
    {},
    { name: "@brains/ask-content", version: "0.0.0-test" },
    { pluginId: "ask-content" },
  );
  if (!isDeclaredEntityType(plugin)) throw new Error("No entity plugin");
  return plugin;
}

describe("Ask content entity", () => {
  test("registers as an independent singleton", () => {
    const plugin = askContentPlugin();
    expect(plugin.id).toBe("ask-content");
    expect(plugin.entityType).toBe("ask-content");
    expect(plugin.adapter.isSingleton).toBe(true);
    expect(plugin.adapter.hasBody).toBe(true);
    // Studio and the vault are shown the header the release writes: the
    // contact note and the refusal are body sections.
    expect(Object.keys(plugin.adapter.frontmatterSchema?.shape ?? {})).toEqual(
      Object.keys(askContentFrontmatterSchema.shape).filter(
        (key) => key !== "contactNote" && key !== "refusal",
      ),
    );
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

// The next stored form (docs/plans/one-stored-form.md) states the contact
// note and the refusal under the introduction.
describe("an ask-content document in the next stored form", () => {
  test("reads the same presentation as the current form", () => {
    const current =
      "---\ncontactLabel: Talk to us\ncontactNote: We read every message.\nrefusal: Only our work.\n---\nWe are a small team.\n";
    const next =
      "---\ncontactLabel: Talk to us\n---\nWe are a small team.\n\n## Contact note\n\nWe read every message.\n\n## Refusal\n\nOnly our work.\n";
    expect(parseAskContent(next)).toEqual(parseAskContent(current));
    expect(parseAskContent(next).introduction).toBe("We are a small team.");
  });
});
