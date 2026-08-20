import { describe, it, expect } from "bun:test";
import { createLinkContent, parseLinkContent } from "../src/lib/link-content";

describe("link content", () => {
  it("writes every frontmatter field, not only the two metadata indexes", () => {
    const content = createLinkContent({
      status: "draft",
      title: "Test Article",
      url: "https://example.com/test",
      description: "A test article",
      summary: "This is a test article summary.",
      domain: "example.com",
      capturedAt: "2025-01-30T10:00:00.000Z",
      source: { ref: "cli:local", label: "CLI" },
    });

    // Regexes rather than exact strings: YAML quoting is the serializer's
    // choice, and asserting it would make this a test of the serializer.
    expect(content).toContain("status: draft");
    expect(content).toContain("title: Test Article");
    expect(content).toMatch(/url: ['"]?https:\/\/example\.com\/test['"]?/);
    expect(content).toContain("description: A test article");
    expect(content).toContain("domain: example.com");
    expect(content).toMatch(/ref: ['"]?cli:local['"]?/);
    expect(content).toContain("label: CLI");
    expect(content).toContain("This is a test article summary.");
  });

  it("round-trips everything it wrote", () => {
    const source = { ref: "cli:local", label: "CLI" };
    const parsed = parseLinkContent(
      createLinkContent({
        status: "draft",
        title: "Test Article",
        url: "https://example.com/test",
        description: "A test article",
        summary: "This is a test article summary.",
        domain: "example.com",
        capturedAt: "2025-01-30T10:00:00.000Z",
        source,
      }),
    );

    expect(parsed.frontmatter).toMatchObject({
      status: "draft",
      title: "Test Article",
      url: "https://example.com/test",
      description: "A test article",
      domain: "example.com",
      capturedAt: "2025-01-30T10:00:00.000Z",
      source,
    });
    expect(parsed.summary).toBe("This is a test article summary.");
  });
});
