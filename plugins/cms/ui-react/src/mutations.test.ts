import { afterEach, describe, expect, it } from "bun:test";
import { mockFetch } from "@brains/test-utils";
import { saveEntity } from "./mutations";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CMS save mutation", () => {
  it("preserves the pinned content-hash precondition on updates", async () => {
    let method: string | undefined;
    let payload: unknown;
    mockFetch(async (_url, options) => {
      method = options.method;
      payload = JSON.parse(String(options.body));
      return Response.json({
        entityId: "field-notes",
        jobId: "job-1",
        skipped: true,
      });
    });

    const result = await saveEntity({
      kind: "update",
      entityType: "post",
      id: "field-notes",
      frontmatter: { title: "Notes from the rhizome" },
      body: "Unchanged body",
      baseContentHash: "hash-when-opened",
    });

    expect(method).toBe("PUT");
    expect(payload).toEqual({
      entityType: "post",
      id: "field-notes",
      frontmatter: { title: "Notes from the rhizome" },
      body: "Unchanged body",
      baseContentHash: "hash-when-opened",
    });
    expect(result.skipped).toBe(true);
  });

  it("creates through the same mutation without an invented precondition", async () => {
    let method: string | undefined;
    let payload: unknown;
    mockFetch(async (_url, options) => {
      method = options.method;
      payload = JSON.parse(String(options.body));
      return Response.json({ entityId: "new-note", jobId: "job-2" });
    });

    await saveEntity({
      kind: "create",
      entityType: "post",
      frontmatter: { title: "New note" },
    });

    expect(method).toBe("POST");
    expect(payload).toEqual({
      entityType: "post",
      frontmatter: { title: "New note" },
    });
  });
});
