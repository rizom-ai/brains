import { afterEach, describe, expect, it } from "bun:test";
import { mockFetch } from "@brains/test-utils";
import type { UIMessage } from "ai";
import type { WebChatSession } from "./api";
import {
  archiveWebChatSession,
  deleteWebChatSession,
  removeWebChatSessionCaches,
  renameWebChatSession,
  renameWebChatSessionCache,
} from "./mutations";
import { createWebChatQueryClient } from "./query-client";
import { webChatKeys } from "./queries";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("web-chat session mutation cache effects", () => {
  it("updates only the renamed session metadata", () => {
    const client = createWebChatQueryClient();
    client.setQueryData<WebChatSession[]>(webChatKeys.sessions(), [
      {
        id: "thread-one",
        title: "Before",
        lastActiveAt: "2026-07-14T12:00:00.000Z",
      },
      {
        id: "thread-two",
        title: "Untouched",
        lastActiveAt: "2026-07-14T11:00:00.000Z",
      },
    ]);

    renameWebChatSessionCache(client, {
      conversationId: "thread-one",
      title: "After",
    });

    expect(
      client.getQueryData<WebChatSession[]>(webChatKeys.sessions()),
    ).toEqual([
      {
        id: "thread-one",
        title: "After",
        lastActiveAt: "2026-07-14T12:00:00.000Z",
      },
      {
        id: "thread-two",
        title: "Untouched",
        lastActiveAt: "2026-07-14T11:00:00.000Z",
      },
    ]);
    client.clear();
  });

  it("removes archived or deleted session metadata and history", () => {
    const client = createWebChatQueryClient();
    client.setQueryData<WebChatSession[]>(webChatKeys.sessions(), [
      {
        id: "thread-one",
        title: "Remove",
        lastActiveAt: "2026-07-14T12:00:00.000Z",
      },
      {
        id: "thread-two",
        title: "Keep",
        lastActiveAt: "2026-07-14T11:00:00.000Z",
      },
    ]);
    client.setQueryData<UIMessage[]>(webChatKeys.history("thread-one"), [
      { id: "message-one", role: "user", parts: [] },
    ]);
    client.setQueryData<UIMessage[]>(webChatKeys.history("thread-two"), [
      { id: "message-two", role: "user", parts: [] },
    ]);

    removeWebChatSessionCaches(client, "thread-one");

    expect(
      client.getQueryData<WebChatSession[]>(webChatKeys.sessions()),
    ).toEqual([
      {
        id: "thread-two",
        title: "Keep",
        lastActiveAt: "2026-07-14T11:00:00.000Z",
      },
    ]);
    expect(client.getQueryData(webChatKeys.history("thread-one"))).toBe(
      undefined,
    );
    expect(
      client.getQueryData<UIMessage[]>(webChatKeys.history("thread-two")),
    ).toEqual([{ id: "message-two", role: "user", parts: [] }]);
    client.clear();
  });
});

describe("web-chat session mutations", () => {
  it("renames one encoded session with the trimmed title payload", async () => {
    let requests = 0;
    let requestedUrl = "";
    let requestOptions: RequestInit = {};
    mockFetch(async (url, options) => {
      requests += 1;
      requestedUrl = url;
      requestOptions = options;
      return Response.json({ renamed: true, title: "Field notes" });
    });

    await renameWebChatSession({
      conversationId: "thread/one",
      title: "Field notes",
    });

    expect(requestedUrl).toBe("/api/chat/sessions?id=thread%2Fone");
    expect(requestOptions.method).toBe("PUT");
    expect(requestOptions.credentials).toBe("include");
    expect(requestOptions.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(requestOptions.body))).toEqual({
      title: "Field notes",
    });
    expect(requests).toBe(1);
  });

  it("archives one encoded session", async () => {
    let requests = 0;
    let requestedUrl = "";
    let requestOptions: RequestInit = {};
    mockFetch(async (url, options) => {
      requests += 1;
      requestedUrl = url;
      requestOptions = options;
      return Response.json({ archived: true });
    });

    await archiveWebChatSession({ conversationId: "thread/one" });

    expect(requestedUrl).toBe("/api/chat/sessions/archive?id=thread%2Fone");
    expect(requestOptions.method).toBe("PUT");
    expect(requestOptions.credentials).toBe("include");
    expect(requests).toBe(1);
  });

  it("deletes one encoded session", async () => {
    let requests = 0;
    let requestedUrl = "";
    let requestOptions: RequestInit = {};
    mockFetch(async (url, options) => {
      requests += 1;
      requestedUrl = url;
      requestOptions = options;
      return Response.json({ deleted: true });
    });

    await deleteWebChatSession({ conversationId: "thread/one" });

    expect(requestedUrl).toBe("/api/chat/sessions?id=thread%2Fone");
    expect(requestOptions.method).toBe("DELETE");
    expect(requestOptions.credentials).toBe("include");
    expect(requests).toBe(1);
  });

  it("surfaces authorization failures without a second request", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return new Response("Forbidden", { status: 403 });
    });
    let caught: unknown;

    try {
      await deleteWebChatSession({ conversationId: "thread/one" });
    } catch (error: unknown) {
      caught = error;
    }

    if (!(caught instanceof Error)) throw caught;
    expect(caught.message).toBe(
      "Your operator session may have expired. Refresh or sign in again.",
    );
    expect(requests).toBe(1);
  });
});
