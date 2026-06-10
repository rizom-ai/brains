import { describe, expect, it } from "bun:test";

import { buildEntityMemoryNote } from "../src/agent-results";

describe("buildEntityMemoryNote", () => {
  it("records updated entity ids from confirmed update results", () => {
    const note = buildEntityMemoryNote([
      {
        toolName: "system_update",
        args: { entityType: "base", id: "rizom-note" },
        data: { updated: "rizom-note" },
      },
    ]);

    expect(note).toContain('base "rizom-note" (updated)');
    expect(note).toContain("Reference these IDs directly in follow-ups");
  });

  it("records created entity ids from confirmed create results", () => {
    const note = buildEntityMemoryNote([
      {
        toolName: "system_create",
        args: { entityType: "social-post" },
        data: { entityId: "linkedin-post", status: "generating" },
      },
    ]);

    expect(note).toContain('social-post "linkedin-post" (generating)');
  });
});
