import { afterEach, describe, expect, it } from "bun:test";
import { mockFetch } from "@brains/test-utils";
import { removeEntity, saveEntity, uploadImage } from "./mutations";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CMS upload mutation", () => {
  it("posts the selected file once as multipart form data", async () => {
    let requests = 0;
    let method: string | undefined;
    let body: BodyInit | null | undefined;
    mockFetch(async (_url, options) => {
      requests += 1;
      method = options.method;
      body = options.body;
      return Response.json({ entityId: "image-cover", jobId: "job-upload" });
    });
    const file = new File(["pixels"], "cover.png", { type: "image/png" });

    const result = await uploadImage(file);

    if (!(body instanceof FormData)) throw new Error("Expected FormData body");
    const uploaded = body.get("file");
    if (!(uploaded instanceof File)) throw new Error("Expected uploaded file");
    expect(method).toBe("POST");
    expect(uploaded.name).toBe("cover.png");
    expect(uploaded.type).toBe("image/png");
    expect(await uploaded.text()).toBe("pixels");
    expect(result).toEqual({ entityId: "image-cover", jobId: "job-upload" });
    expect(requests).toBe(1);
  });
});

describe("CMS delete mutation", () => {
  it("deletes the identified entity exactly once", async () => {
    let requestedUrl = "";
    let method: string | undefined;
    mockFetch(async (url, options) => {
      requestedUrl = url;
      method = options.method;
      return Response.json({ deleted: true });
    });

    const result = await removeEntity({
      entityType: "field note",
      id: "day/one",
    });

    expect(requestedUrl).toBe(
      "/cms/api/entities?type=field%20note&id=day%2Fone",
    );
    expect(method).toBe("DELETE");
    expect(result).toEqual({ deleted: true });
  });
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
