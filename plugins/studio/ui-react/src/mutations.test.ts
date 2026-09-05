import { describe, expect, it } from "bun:test";
import type { FetchLike } from "@brains/utils/fetch-like";
import { StudioApi } from "./api";
import {
  removeEntity,
  runDeclarativeWorkspaceAction,
  saveEntity,
  uploadImage,
} from "./mutations";

// The functions under test are handed a client built on delegatingFetch,
// which reads the per-test handler at call time, so the global fetch is never
// touched and there is nothing to restore.
type StubHandler = (url: string, options: RequestInit) => Promise<Response>;
let fetchFn: FetchLike = () =>
  Promise.reject(new Error("fetch called without a stub"));
const delegatingFetch: FetchLike = (input, init) => fetchFn(input, init);
const studioApi = new StudioApi({
  basePath: "/studio",
  fetch: delegatingFetch,
});

function stubFetch(handler: StubHandler): void {
  fetchFn = (input, init): Promise<Response> =>
    handler(String(input), init ?? {});
}

describe("declarative Studio workspace mutation", () => {
  it("posts the normalized action id and JSON input", async () => {
    let payload: unknown;
    stubFetch(async (_url, options) => {
      payload = JSON.parse(String(options.body));
      return Response.json({ result: { refreshed: "saved-1" } });
    });

    const result = await runDeclarativeWorkspaceAction(studioApi, {
      workspaceId: "@fixture/reading-operator:reading-operator:library",
      action: {
        actionId: "refresh",
        label: "Refresh",
        input: { id: "saved-1" },
      },
    });

    expect(payload).toEqual({
      id: "@fixture/reading-operator:reading-operator:library",
      action: { actionId: "refresh", input: { id: "saved-1" } },
    });
    expect(result).toEqual({ refreshed: "saved-1" });
  });

  it("carries host-owned prepared confirmation phases", async () => {
    const payloads: unknown[] = [];
    stubFetch(async (_url, options) => {
      payloads.push(JSON.parse(String(options.body)));
      return Response.json({ result: { success: true } });
    });
    const action = {
      actionId: "publish",
      label: "Publish",
      input: { entityType: "post", entityId: "post-1" },
    };

    await runDeclarativeWorkspaceAction(studioApi, {
      workspaceId: "content-pipeline:publishing",
      action: { ...action, invocation: { mode: "prepare" } },
    });
    await runDeclarativeWorkspaceAction(studioApi, {
      workspaceId: "content-pipeline:publishing",
      action: {
        ...action,
        invocation: { mode: "execute", token: "confirmation-token" },
      },
    });

    expect(payloads).toEqual([
      {
        id: "content-pipeline:publishing",
        action: {
          actionId: "publish",
          input: { entityType: "post", entityId: "post-1" },
          mode: "prepare",
        },
      },
      {
        id: "content-pipeline:publishing",
        action: {
          actionId: "publish",
          input: { entityType: "post", entityId: "post-1" },
          mode: "execute",
          confirmationToken: "confirmation-token",
        },
      },
    ]);
  });
});

describe("Studio upload mutation", () => {
  it("posts the selected file once as multipart form data", async () => {
    let requests = 0;
    let method: string | undefined;
    let body: BodyInit | null | undefined;
    stubFetch(async (_url, options) => {
      requests += 1;
      method = options.method;
      body = options.body;
      return Response.json({ entityId: "image-cover", jobId: "job-upload" });
    });
    const file = new File(["pixels"], "cover.png", { type: "image/png" });

    const result = await uploadImage(studioApi, file);

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

describe("Studio delete mutation", () => {
  it("deletes the identified entity exactly once", async () => {
    let requestedUrl = "";
    let method: string | undefined;
    let payload: unknown;
    stubFetch(async (url, options) => {
      requestedUrl = url;
      method = options.method;
      payload = JSON.parse(String(options.body));
      return Response.json({ deleted: true });
    });

    const result = await removeEntity(studioApi, {
      entityType: "field note",
      id: "day/one",
    });

    expect(requestedUrl).toBe(
      "/studio/api/entities?type=field%20note&id=day%2Fone",
    );
    expect(method).toBe("DELETE");
    expect(payload).toEqual({ confirmed: true });
    expect(result).toEqual({ deleted: true });
  });
});

describe("Studio save mutation", () => {
  it("preserves the pinned content-hash precondition on updates", async () => {
    let method: string | undefined;
    let payload: unknown;
    stubFetch(async (_url, options) => {
      method = options.method;
      payload = JSON.parse(String(options.body));
      return Response.json({
        entityId: "field-notes",
        jobId: "job-1",
        skipped: true,
      });
    });

    const result = await saveEntity(studioApi, {
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
    stubFetch(async (_url, options) => {
      method = options.method;
      payload = JSON.parse(String(options.body));
      return Response.json({ entityId: "new-note", jobId: "job-2" });
    });

    await saveEntity(studioApi, {
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
