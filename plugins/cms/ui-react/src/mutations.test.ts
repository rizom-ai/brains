import { afterEach, describe, expect, it } from "bun:test";
import { mockFetch } from "@brains/test-utils";
import {
  removeEntity,
  runCmsWorkspaceAction,
  runDirectorySyncWorkspaceAction,
  runEmailReplyDraftAction,
  runEmailReplyDraftSource,
  runInboxWorkspaceAction,
  runSiteWorkspaceAction,
  saveEntity,
  uploadImage,
} from "./mutations";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CMS workspace mutation", () => {
  it("posts one typed action to the encoded workspace", async () => {
    let requests = 0;
    let requestedUrl = "";
    let method: string | undefined;
    let payload: unknown;
    mockFetch(async (url, options) => {
      requests += 1;
      requestedUrl = url;
      method = options.method;
      payload = JSON.parse(String(options.body));
      return Response.json({ result: { success: true } });
    });

    const result = await runCmsWorkspaceAction({
      workspaceId: "publishing/desk",
      action: {
        type: "queue",
        entityType: "post",
        entityId: "field-notes",
      },
    });

    expect(requestedUrl).toBe("/cms/api/workspace");
    expect(method).toBe("POST");
    expect(payload).toEqual({
      id: "publishing/desk",
      action: {
        type: "queue",
        entityType: "post",
        entityId: "field-notes",
      },
    });
    expect(result).toEqual({ success: true });
    expect(requests).toBe(1);
  });
});

describe("CMS Site workspace mutation", () => {
  it("requires the typed production confirmation payload", async () => {
    let payload: unknown;
    mockFetch(async (_url, options) => {
      payload = JSON.parse(String(options.body));
      return Response.json({
        result: { accepted: true, environment: "production" },
      });
    });

    const result = await runSiteWorkspaceAction({
      workspaceId: "site",
      action: { type: "build-production", confirmed: true },
    });

    expect(payload).toEqual({
      id: "site",
      action: { type: "build-production", confirmed: true },
    });
    expect(result).toEqual({ accepted: true, environment: "production" });
  });
});

describe("CMS Directory Sync workspace mutation", () => {
  it("posts only the normal Sync now action", async () => {
    let payload: unknown;
    mockFetch(async (_url, options) => {
      payload = JSON.parse(String(options.body));
      return Response.json({
        result: { accepted: true, status: "queued", runId: "run-1" },
      });
    });

    const result = await runDirectorySyncWorkspaceAction({
      workspaceId: "sync",
      action: { type: "sync-now" },
    });

    expect(payload).toEqual({
      id: "sync",
      action: { type: "sync-now" },
    });
    expect(result).toEqual({
      accepted: true,
      status: "queued",
      runId: "run-1",
    });
  });
});

describe("CMS Unified Inbox workspace mutation", () => {
  it("posts the exact server-confirmed inbox action", async () => {
    let payload: unknown;
    mockFetch(async (_url, options) => {
      payload = JSON.parse(String(options.body));
      return Response.json({ result: { kind: "completed" } });
    });

    const result = await runInboxWorkspaceAction({
      workspaceId: "inbox",
      action: {
        sourceId: "mail-items",
        itemId: "mail-1",
        actionId: "archive",
        confirmed: true,
      },
    });

    expect(payload).toEqual({
      id: "inbox",
      action: {
        sourceId: "mail-items",
        itemId: "mail-1",
        actionId: "archive",
        confirmed: true,
      },
    });
    expect(result).toEqual({ kind: "completed" });
  });
});

describe("CMS email reply draft mutation", () => {
  it("reads private source outside query state with request cancellation", async () => {
    let payload: unknown;
    let signal: AbortSignal | null | undefined;
    mockFetch(async (_url, options) => {
      payload = JSON.parse(String(options.body));
      signal = options.signal;
      return Response.json({
        result: {
          kind: "source",
          source: {
            from: { address: "sender@example.com" },
            subject: "Subject",
            receivedAt: "2026-08-05T09:00:00.000Z",
            text: "Private source",
            truncated: false,
          },
        },
      });
    });
    const controller = new AbortController();

    const result = await runEmailReplyDraftSource({
      workspaceId: "email-reply-drafts",
      request: { type: "source", mailItemId: `mail-${"a".repeat(64)}` },
      signal: controller.signal,
    });

    expect(payload).toEqual({
      id: "email-reply-drafts",
      action: { type: "source", mailItemId: `mail-${"a".repeat(64)}` },
    });
    expect(signal).toBe(controller.signal);
    expect(result).toMatchObject({
      kind: "source",
      source: { text: "Private source" },
    });
  });

  it("posts only the authored draft revision", async () => {
    let payload: unknown;
    mockFetch(async (_url, options) => {
      payload = JSON.parse(String(options.body));
      return Response.json({
        result: {
          kind: "draft",
          draft: {
            text: "Authored reply",
            revision: 2,
            status: "draft",
            updatedAt: "2026-08-05T10:00:00.000Z",
          },
        },
      });
    });

    const result = await runEmailReplyDraftAction({
      workspaceId: "email-reply-drafts",
      action: {
        type: "save",
        mailItemId: `mail-${"a".repeat(64)}`,
        text: "Authored reply",
        baseRevision: 1,
      },
    });

    expect(payload).toEqual({
      id: "email-reply-drafts",
      action: {
        type: "save",
        mailItemId: `mail-${"a".repeat(64)}`,
        text: "Authored reply",
        baseRevision: 1,
      },
    });
    expect(result).toMatchObject({
      kind: "draft",
      draft: { text: "Authored reply", revision: 2 },
    });
  });

  it("posts the explicitly confirmed saved revision for sending", async () => {
    let payload: unknown;
    mockFetch(async (_url, options) => {
      payload = JSON.parse(String(options.body));
      return Response.json({
        result: {
          kind: "sent",
          draft: {
            text: "Authored reply",
            revision: 2,
            status: "sent",
            updatedAt: "2026-08-05T10:01:00.000Z",
            sentAt: "2026-08-05T10:01:00.000Z",
          },
        },
      });
    });

    const result = await runEmailReplyDraftAction({
      workspaceId: "email-reply-drafts",
      action: {
        type: "send",
        mailItemId: `mail-${"a".repeat(64)}`,
        revision: 2,
        confirmed: true,
      },
    });

    expect(payload).toEqual({
      id: "email-reply-drafts",
      action: {
        type: "send",
        mailItemId: `mail-${"a".repeat(64)}`,
        revision: 2,
        confirmed: true,
      },
    });
    expect(result).toMatchObject({
      kind: "sent",
      draft: { revision: 2, status: "sent" },
    });
  });
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
    let payload: unknown;
    mockFetch(async (url, options) => {
      requestedUrl = url;
      method = options.method;
      payload = JSON.parse(String(options.body));
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
    expect(payload).toEqual({ confirmed: true });
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
