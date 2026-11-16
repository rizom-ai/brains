import { describe, expect, it } from "bun:test";
import { updatePublishFrontmatter } from "../src/publish-state-updater";

describe("publish state updater", () => {
  it("updates status and publishedAt in existing frontmatter", () => {
    const updated = updatePublishFrontmatter(
      `---
title: Test
status: draft
---
Body`,
      "2026-06-04T12:00:00.000Z",
    );

    expect(updated).toContain("status: published");
    expect(updated).toContain("publishedAt: '2026-06-04T12:00:00.000Z'");
    expect(updated).toContain("Body");
  });

  it("updates configured provider result ID field in frontmatter", () => {
    const updated = updatePublishFrontmatter(
      `---
title: Test
status: draft
---
Body`,
      "2026-06-04T12:00:00.000Z",
      "urn:li:share:123",
      "platformPostId",
    );

    expect(updated).toContain("platformPostId: 'urn:li:share:123'");
  });

  const published =
    "---\ntitle: Test\nstatus: published\npublishedAt: '2026-06-04T12:00:00.000Z'\n---\nBody\n";

  it.each([
    ["a bare fence", "\n", "---"],
    ["a fence with a trailing space", "\n", "--- "],
    ["a fence with a trailing tab", "\n", "---\t"],
    ["a CRLF file", "\r\n", "---"],
    ["a CRLF file with a trailing space", "\r\n", "--- "],
  ])("writes the publish state behind %s", (_label, eol, fence) => {
    const content = ["---", "title: Test", "status: draft", fence, "Body"].join(
      eol,
    );

    expect(updatePublishFrontmatter(content, "2026-06-04T12:00:00.000Z")).toBe(
      published,
    );
  });

  it("does not add frontmatter to plain content", () => {
    const updated = updatePublishFrontmatter(
      "Plain publish content",
      "2026-06-04T12:00:00.000Z",
    );

    expect(updated).toBe("Plain publish content");
  });
});
