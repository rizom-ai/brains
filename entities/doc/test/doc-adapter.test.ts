import { describe, expect, it } from "bun:test";
import { docAdapter } from "../src/adapters/doc-adapter";

describe("DocAdapter", () => {
  it("parses doc markdown into metadata", () => {
    const parsed = docAdapter.fromMarkdown(`---
title: Getting Started
section: Start here
order: 10
sourcePath: packages/brain-cli/docs/getting-started.md
description: First steps
---

# Getting Started

Hello.
`);

    expect(parsed.entityType).toBe("doc");
    expect(parsed.metadata).toEqual({
      title: "Getting Started",
      section: "Start here",
      order: 10,
      slug: "getting-started",
      description: "First steps",
    });
  });

  it("uses explicit slug when provided", () => {
    const parsed = docAdapter.fromMarkdown(`---
title: brain.yaml Reference
section: Start here
order: 20
sourcePath: packages/brain-cli/docs/brain-yaml-reference.md
slug: brain-yaml-reference
---

# brain.yaml Reference
`);

    expect(parsed.metadata?.slug).toBe("brain-yaml-reference");
  });
});
