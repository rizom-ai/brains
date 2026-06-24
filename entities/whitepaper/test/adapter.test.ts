import { describe, it, expect, beforeEach } from "bun:test";
import { WhitepaperAdapter } from "../src/adapters/whitepaper-adapter";
import {
  createNewInstitutionsWhitepaper,
  newInstitutionsWhitepaperContent,
} from "./fixtures/whitepaper-entities";

describe("WhitepaperAdapter", () => {
  let adapter: WhitepaperAdapter;

  beforeEach(() => {
    adapter = new WhitepaperAdapter();
  });

  it("has the correct entity type and schema", () => {
    expect(adapter.entityType).toBe("whitepaper");
    expect(adapter.schema).toBeDefined();
  });

  it("converts markdown frontmatter into metadata", () => {
    const result = adapter.fromMarkdown(newInstitutionsWhitepaperContent);

    expect(result.entityType).toBe("whitepaper");
    expect(result.content).toBe(newInstitutionsWhitepaperContent);
    expect(result.metadata).toEqual({
      title:
        "New Institutions: Technology for Sovereign, Regenerative, Distributed Coordination",
      status: "outline",
      slug: "new-institutions",
      publishedAt: undefined,
    });
  });

  it("generates a slug when one is not provided", () => {
    const markdown = `---
title: Strategic White Paper
status: draft
---

Body.`;

    const result = adapter.fromMarkdown(markdown);

    expect(result.metadata?.slug).toBe("strategic-white-paper");
  });

  it("preserves frontmatter and backfills slug on serialize", () => {
    const entity = createNewInstitutionsWhitepaper({
      content: `---
title: New Institutions
status: outline
---

Body.`,
    });

    const markdown = adapter.toMarkdown(entity);

    expect(markdown).toContain("title: New Institutions");
    expect(markdown).toContain("status: outline");
    expect(markdown).toContain("slug: new-institutions");
    expect(markdown).toContain("Body.");
  });

  it("parses cover image and document attachment references", () => {
    const entity = createNewInstitutionsWhitepaper({
      content: `---
title: New Institutions
status: published
coverImageId: cover-1
documents:
  - id: new-institutions-pdf
---

Body.`,
    });

    const frontmatter = adapter.parseWhitepaperFrontmatter(entity);

    expect(frontmatter.coverImageId).toBe("cover-1");
    expect(frontmatter.documents).toEqual([{ id: "new-institutions-pdf" }]);
  });

  it("builds generation stubs as idea whitepapers", () => {
    const stub = adapter.buildStub({
      id: "future-paper",
      title: "Future Paper",
    });

    expect(stub.metadata).toEqual({
      title: "Future Paper",
      slug: "future-paper",
      status: "idea",
    });
    expect(stub.content).toContain("status: idea");
  });
});
