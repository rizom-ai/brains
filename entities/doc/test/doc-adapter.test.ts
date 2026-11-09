import { describe, expect, it } from "bun:test";
import { docsPlugin } from "./docs-plugin";

// The adapter the docs register for their type.
const docAdapter = docsPlugin().adapter;

describe("DocAdapter", () => {
  it("parses doc markdown into metadata", () => {
    const parsed = docAdapter.fromMarkdown(`---
title: Getting Started
section: Start here
order: 10
description: First steps
---

# Getting Started

Hello.
`);

    expect(parsed.metadata).toEqual({
      title: "Getting Started",
      section: "Start here",
      order: 10,
      slug: "getting-started",
      description: "First steps",
    });
    // A declared type reads back its body.
    expect(parsed.content?.trim()).toBe("# Getting Started\n\nHello.");
  });

  it("uses explicit slug when provided", () => {
    const parsed = docAdapter.fromMarkdown(`---
title: brain.yaml Reference
section: Start here
order: 20
slug: brain-yaml-reference
---

# brain.yaml Reference
`);

    expect(parsed.metadata?.["slug"]).toBe("brain-yaml-reference");
    expect(parsed.metadata?.["authoredSlug"]).toBe(true);
  });
});
