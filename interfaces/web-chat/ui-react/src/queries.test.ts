import { afterEach, describe, expect, it } from "bun:test";
import { QueryObserver, type QueryObserverResult } from "@tanstack/react-query";
import { mockFetch } from "@brains/test-utils";
import type { WebChatSession } from "./api";
import { createWebChatQueryClient } from "./query-client";
import { sessionListQueryOptions, webChatKeys } from "./queries";

const originalFetch = globalThis.fetch;

function session(title: string): WebChatSession {
  return {
    id: "web-session",
    title,
    lastActiveAt: "2026-07-14T12:00:00.000Z",
  };
}

function waitForResult(
  observer: QueryObserver<
    WebChatSession[],
    Error,
    WebChatSession[],
    WebChatSession[],
    ReturnType<typeof webChatKeys.sessions>
  >,
  predicate: (result: QueryObserverResult<WebChatSession[], Error>) => boolean,
): Promise<QueryObserverResult<WebChatSession[], Error>> {
  return new Promise((resolve) => {
    const unsubscribe = observer.subscribe((result) => {
      if (!predicate(result)) return;
      unsubscribe();
      resolve(result);
    });
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("web-chat session-list query", () => {
  it("loads once for the mounted observer and initialization read", async () => {
    let requests = 0;
    mockFetch(async (_url, options) => {
      requests += 1;
      expect(options.credentials).toBe("include");
      return Response.json({ sessions: [session("Field notes")] });
    });
    const client = createWebChatQueryClient();
    const options = sessionListQueryOptions();
    const observer = new QueryObserver(client, options);
    const statuses: string[] = [];
    const unsubscribe = observer.subscribe((result) => {
      statuses.push(result.status);
    });

    const initialized = await client.ensureQueryData(options);

    expect(webChatKeys.sessions()).toEqual(["web-chat", "sessions"]);
    expect(initialized).toEqual([session("Field notes")]);
    expect(statuses).toContain("pending");
    expect(observer.getCurrentResult().status).toBe("success");
    expect(requests).toBe(1);
    unsubscribe();
    client.clear();
  });

  it("surfaces authorization errors without retrying", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    });
    const client = createWebChatQueryClient();
    const observer = new QueryObserver(client, sessionListQueryOptions());
    const result = await waitForResult(
      observer,
      (candidate) => candidate.status === "error",
    );

    expect(result.error?.message).toBe(
      "Your operator session may have expired. Refresh or sign in again.",
    );
    expect(requests).toBe(1);
    client.clear();
  });

  it("refetches one active session list after invalidation", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json({
        sessions: [session(requests === 1 ? "Before" : "After")],
      });
    });
    const client = createWebChatQueryClient();
    const observer = new QueryObserver(client, sessionListQueryOptions());
    let resolveFirst: (() => void) | undefined;
    let resolveRefreshed:
      | ((result: QueryObserverResult<WebChatSession[], Error>) => void)
      | undefined;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const refreshed = new Promise<QueryObserverResult<WebChatSession[], Error>>(
      (resolve) => {
        resolveRefreshed = resolve;
      },
    );
    const unsubscribe = observer.subscribe((result) => {
      if (result.data?.[0]?.title === "Before") resolveFirst?.();
      if (result.data?.[0]?.title === "After") resolveRefreshed?.(result);
    });
    await first;

    await client.invalidateQueries({ queryKey: webChatKeys.sessions() });
    const result = await refreshed;

    expect(result.data?.[0]?.title).toBe("After");
    expect(requests).toBe(2);
    unsubscribe();
    client.clear();
  });
});
