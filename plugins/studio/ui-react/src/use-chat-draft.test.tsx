/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ChatUploadResponse } from "@brains/contracts/chat";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { studioChatDraftKey } from "./studio-chat-draft-key";
import { StudioChatDraftStore } from "./studio-chat-drafts";
import { useChatDraft, type ChatDraft } from "./use-chat-draft";

function uploaded(name: string): ChatUploadResponse {
  return {
    id: `upload-${name}`,
    ref: { kind: "upload", id: `ref-${name}` },
    filename: name,
    mediaType: "text/markdown",
    sizeBytes: 12,
    createdAt: "2026-09-19T00:00:00.000Z",
    url: `/uploads/${name}`,
    downloadUrl: `/uploads/${name}?download=1`,
  };
}

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

async function renderDraft(
  store: StudioChatDraftStore,
  sessionId: string | null,
): Promise<() => ChatDraft> {
  let latest: ChatDraft | undefined;
  function Probe(): ReactElement | null {
    latest = useChatDraft({
      draftStore: store,
      apiPath: "/api/chat",
      sessionId,
    });
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  return (): ChatDraft => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
}

describe("useChatDraft", () => {
  it("reads and writes the open session's draft in the store", async () => {
    const store = new StudioChatDraftStore();
    const draft = await renderDraft(store, "a");

    await act(async () => draft().setDraft("Field notes"));

    expect(draft().draft).toBe("Field notes");
    expect(store.read(studioChatDraftKey("/api/chat", "a")).text).toBe(
      "Field notes",
    );
  });

  it("updates uploads from the store's current list", async () => {
    const store = new StudioChatDraftStore();
    const draft = await renderDraft(store, "a");

    await act(async () => draft().setUploads([uploaded("one.md")]));
    await act(async () =>
      draft().setUploads((current) => [...current, uploaded("two.md")]),
    );

    expect(draft().uploads.map((upload) => upload.filename)).toEqual([
      "one.md",
      "two.md",
    ]);
  });

  it("follows the open session, keeping each session's draft", async () => {
    const store = new StudioChatDraftStore();
    store.update(studioChatDraftKey("/api/chat", "a"), { text: "For a" });
    const first = await renderDraft(store, "a");
    expect(first().draft).toBe("For a");

    const second = await renderDraft(store, "b");

    expect(second().draft).toBe("");
    expect(second().currentDraftKey.current).toBe(
      studioChatDraftKey("/api/chat", "b"),
    );
  });
});
