/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ChatSession, ChatSessionListQuery } from "@brains/contracts/chat";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { STUDIO_CHAT_ROUTE_PATH } from "../../src/chat-workspace";
import { createStudioQueryClient } from "./query-client";
import { studioChatKeys } from "./studio-chat-contracts";
import {
  useChatSessions,
  type ChatSessions,
  type ChatSessionsInput,
} from "./use-chat-sessions";

function session(
  id: string,
  overrides: Partial<ChatSession> = {},
): ChatSession {
  return {
    id,
    title: `Session ${id}`,
    lastActiveAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio/chat" });
  restoreGlobals = installDomGlobals(windowInstance);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
  restoreGlobals();
});

interface Harness {
  queries: ChatSessionListQuery[];
  navigations: Array<[string, { preserveWork?: boolean } | undefined]>;
  client: QueryClient;
  sessions: () => ChatSessions;
}

async function renderSessions(
  overrides: Partial<ChatSessionsInput> = {},
  listed: ChatSession[] = [session("a")],
): Promise<Harness> {
  const client = createStudioQueryClient();
  const harness: Harness = {
    queries: [],
    navigations: [],
    client,
    sessions: (): ChatSessions => {
      throw new Error("hook did not render");
    },
  };
  let latest: ChatSessions | undefined;
  function Probe(): ReactElement | null {
    latest = useChatSessions({
      chatClient: {
        listSessions: async (query): Promise<ChatSession[]> => {
          harness.queries.push(query ?? {});
          return listed;
        },
      },
      queryClient: client,
      sessionId: null,
      studioBasePath: "/studio",
      navigate: (href, options): void => {
        harness.navigations.push([href, options]);
      },
      ...overrides,
    });
    return null;
  }
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Probe)),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  harness.sessions = (): ChatSessions => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  return harness;
}

describe("useChatSessions", () => {
  it("lists sessions for the current view", async () => {
    const harness = await renderSessions();

    expect(harness.sessions().sessions.map((entry) => entry.id)).toEqual(["a"]);
    expect(harness.queries).toEqual([
      { query: "", archived: false, offset: 0 },
    ]);
  });

  it("debounces a search into one view change and resets the offset", async () => {
    const harness = await renderSessions();
    await act(async () => {
      harness.sessions().sessionControls.onView({
        query: "",
        archived: false,
        offset: 25,
      });
    });
    harness.queries.length = 0;

    await act(async () => {
      harness.sessions().sessionControls.onSearch("dra");
    });
    await act(async () => {
      harness.sessions().sessionControls.onSearch("draft");
    });
    // Both keystrokes land inside the 250ms window.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(harness.queries).toEqual([]);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(harness.queries).toEqual([
      { query: "draft", archived: false, offset: 0 },
    ]);
    expect(harness.sessions().sessionControls.search).toBe("draft");
  });

  it("resolves the current session from another cached page", async () => {
    const client = createStudioQueryClient();
    client.setQueryData(
      [
        ...studioChatKeys.sessions,
        { query: "old", archived: false, offset: 0 },
      ],
      [session("z", { title: "Archived elsewhere" })],
    );
    const harness = await renderSessions({
      queryClient: client,
      sessionId: "z",
    });
    // The rendered page does not contain z; the cache from another page does.
    expect(harness.sessions().sessions.map((entry) => entry.id)).toEqual(["a"]);
    expect(harness.sessions().currentSession?.title).toBe("Archived elsewhere");
  });

  it("reports an archived session", async () => {
    const harness = await renderSessions({ sessionId: "a" }, [
      session("a", { archived: true }),
    ]);

    expect(harness.sessions().archivedSession).toBe(true);
  });

  it("navigates to a session and closes the disclosures", async () => {
    const harness = await renderSessions();
    await act(async () => {
      harness.sessions().setSessionPickerOpen(true);
      harness.sessions().setDetailsOpen(true);
    });
    expect(harness.sessions().sessionPickerOpen).toBe(true);

    await act(async () => harness.sessions().navigateToSession("b", true));

    // The chat route is absolute; the studio base path is deliberately ignored.
    expect(harness.navigations).toEqual([
      [`${STUDIO_CHAT_ROUTE_PATH}?session=b`, { preserveWork: true }],
    ]);
    expect(harness.sessions().sessionPickerOpen).toBe(false);
    expect(harness.sessions().detailsOpen).toBe(false);
  });

  it("closes both disclosures on demand", async () => {
    const harness = await renderSessions();
    await act(async () => {
      harness.sessions().setSessionPickerOpen(true);
      harness.sessions().setDetailsOpen(true);
    });

    await act(async () => harness.sessions().closeDisclosures());

    expect(harness.sessions().sessionPickerOpen).toBe(false);
    expect(harness.sessions().detailsOpen).toBe(false);
    expect(harness.navigations).toEqual([]);
  });

  it("surfaces a listing failure with a retry", async () => {
    const client = createStudioQueryClient();
    let attempts = 0;
    const harness = await renderSessions({
      queryClient: client,
      chatClient: {
        listSessions: async (): Promise<ChatSession[]> => {
          attempts += 1;
          if (attempts === 1) throw new Error("offline");
          return [session("a")];
        },
      },
    });

    expect(harness.sessions().sessionControls.error).toBe(
      "Sessions could not be loaded.",
    );

    await act(async () => harness.sessions().sessionControls.onRetry());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(harness.sessions().sessionControls.error).toBeNull();
    expect(harness.sessions().sessions.map((entry) => entry.id)).toEqual(["a"]);
  });
});
