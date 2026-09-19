/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act, createElement, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { studioChatKeys } from "./studio-chat-contracts";
import { useChatArchive, type ChatArchive } from "./use-chat-archive";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/chat" });
  restoreGlobals = installDomGlobals(windowInstance);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

interface Harness {
  archive: () => ChatArchive;
  archived: string[];
  navigations: (string | undefined)[];
  sendingCalls: boolean[];
  errors: (string | null)[];
  queryClient: QueryClient;
}

async function renderArchive(
  options: {
    sessionId?: string | null;
    blocked?: boolean;
    archiveSession?: (id: string) => Promise<void>;
    hold?: { promise: Promise<void>; release: () => void };
  } = {},
): Promise<Harness> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const harness: Harness = {
    archived: [],
    navigations: [],
    sendingCalls: [],
    errors: [],
    queryClient,
    archive: (): ChatArchive => {
      throw new Error("hook did not render");
    },
  };
  let latest: ChatArchive | undefined;
  function Probe(): ReactElement | null {
    const mountedRef = useRef(true);
    latest = useChatArchive({
      chatClient: {
        archiveSession: async (id): Promise<{ archived: boolean }> => {
          harness.archived.push(id);
          await options.archiveSession?.(id);
          await options.hold?.promise;
          return { archived: true };
        },
      },
      queryClient,
      sessionId: options.sessionId === undefined ? "one" : options.sessionId,
      draftKey: "key",
      currentDraftKey: { current: "key" },
      mountedRef,
      blocked: options.blocked ?? false,
      setSending: (value): void => {
        harness.sendingCalls.push(value);
      },
      setError: (value): void => {
        harness.errors.push(value);
      },
      navigateToSession: (id): void => {
        harness.navigations.push(id);
      },
    });
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  harness.archive = (): ChatArchive => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  return harness;
}

describe("useChatArchive", () => {
  it("archives the open conversation and leaves it for a new one", async () => {
    const harness = await renderArchive();

    await act(async () => harness.archive().archiveCurrent());

    expect(harness.archived).toEqual(["one"]);
    expect(harness.navigations).toEqual([undefined]);
    expect(harness.sendingCalls).toEqual([true, false]);
    expect(harness.archive().archiving).toBe(false);
  });

  it("refuses while the composer still holds unsent work", async () => {
    const harness = await renderArchive({ blocked: true });

    await act(async () => harness.archive().archiveCurrent());

    expect(harness.archived).toEqual([]);
    expect(harness.navigations).toEqual([]);
    expect(harness.sendingCalls).toEqual([]);
  });

  it("does nothing without an open conversation to archive", async () => {
    const harness = await renderArchive({ sessionId: null });

    await act(async () => harness.archive().archiveCurrent());

    expect(harness.archived).toEqual([]);
    expect(harness.sendingCalls).toEqual([]);
  });

  it("reports a failure and releases the composer rather than navigating", async () => {
    const harness = await renderArchive({
      archiveSession: (): Promise<void> =>
        Promise.reject(new Error("Conversation is locked")),
    });

    await act(async () => harness.archive().archiveCurrent());

    expect(harness.navigations).toEqual([]);
    expect(harness.errors).toEqual(["Conversation is locked"]);
    expect(harness.sendingCalls).toEqual([true, false]);
    expect(harness.archive().archiving).toBe(false);
  });

  it("stops showing an archive in flight once the conversation is gone", async () => {
    let release = (): void => undefined;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = await renderArchive({ hold: { promise, release } });

    let running: Promise<void> | undefined;
    await act(async () => {
      running = harness.archive().archiveCurrent();
    });
    expect(harness.archive().archiving).toBe(true);

    await act(async () => harness.archive().reset());
    expect(harness.archive().archiving).toBe(false);

    await act(async () => {
      release();
      await running;
    });
  });

  it("refreshes the session list so the archived one drops out", async () => {
    const harness = await renderArchive();
    let invalidated = 0;
    const original = harness.queryClient.invalidateQueries.bind(
      harness.queryClient,
    );
    harness.queryClient.invalidateQueries = async (filters): Promise<void> => {
      if (filters?.queryKey === studioChatKeys.sessions) invalidated += 1;
      return original(filters);
    };

    await act(async () => harness.archive().archiveCurrent());

    expect(invalidated).toBe(1);
  });
});
