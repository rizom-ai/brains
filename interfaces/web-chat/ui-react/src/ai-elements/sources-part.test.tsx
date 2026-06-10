import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SourcesPart } from "./data-parts";

describe("SourcesPart", () => {
  it("renders source citations as a compact list", () => {
    const markup = renderToStaticMarkup(
      createElement(SourcesPart, {
        data: {
          kind: "sources",
          id: "sources:tool-results",
          title: "Retrieved sources",
          sources: [
            {
              id: "post:resilience",
              title: "Resilience Is Not Redundancy",
              source: "post",
              entityType: "post",
              entityId: "resilience",
              excerpt: "More replicas alone do not make a system resilient.",
              provenance: { toolName: "system_search", score: 0.91 },
            },
          ],
        },
      }),
    );

    expect(markup).toContain("<details");
    expect(markup).toContain("web-chat-sources-card");
    expect(markup).toContain("1 retrieved");
    expect(markup).toContain("Retrieved sources");
    expect(markup).toContain("Resilience Is Not Redundancy");
    expect(markup).toContain("post · resilience");
    expect(markup).toContain("score 0.91");
    expect(markup).toContain(
      "More replicas alone do not make a system resilient.",
    );
  });

  it("falls back to generic data rendering for malformed source payloads", () => {
    const markup = renderToStaticMarkup(
      createElement(SourcesPart, {
        data: {
          kind: "sources",
          id: "sources:bad",
          sources: [],
        },
      }),
    );

    expect(markup).toContain("web-chat-data-part");
    expect(markup).toContain("data-sources");
  });
});
