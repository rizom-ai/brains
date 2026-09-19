/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ChatUploadResponse } from "@brains/contracts/chat";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChatUploadAttempt } from "./studio-chat-contracts";
import { useChatUploads, type ChatUploads } from "./use-chat-uploads";

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

function attempt(id: string, name = `${id}.md`): ChatUploadAttempt {
  return {
    id,
    file: new File(["content"], name, { type: "text/markdown" }),
    status: "uploading",
  };
}

let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/chat" });
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
});

interface Deferred {
  resolve: (value: ChatUploadResponse) => void;
  reject: (cause: unknown) => void;
  promise: Promise<ChatUploadResponse>;
}

function deferred(): Deferred {
  let resolve: (value: ChatUploadResponse) => void = () => undefined;
  let reject: (cause: unknown) => void = () => undefined;
  const promise = new Promise<ChatUploadResponse>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { resolve, reject, promise };
}

interface Harness {
  uploads: () => ChatUploads;
  accepted: ChatUploadResponse[];
  pending: Map<string, Deferred>;
  draftKey: { current: string };
}

async function renderUploads(): Promise<Harness> {
  const pending = new Map<string, Deferred>();
  const harness: Harness = {
    accepted: [],
    pending,
    draftKey: { current: "key" },
    uploads: (): ChatUploads => {
      throw new Error("hook did not render");
    },
  };
  let latest: ChatUploads | undefined;
  function Probe(): ReactElement | null {
    latest = useChatUploads({
      chatClient: {
        upload: (_file, filename): Promise<ChatUploadResponse> => {
          const gate = deferred();
          pending.set(filename, gate);
          return gate.promise;
        },
      },
      draftKey: "key",
      currentDraftKey: harness.draftKey,
      setUploads: (value): void => {
        harness.accepted =
          typeof value === "function" ? value(harness.accepted) : value;
      },
    });
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  harness.uploads = (): ChatUploads => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  return harness;
}

describe("useChatUploads", () => {
  it("accepts an upload into the draft and clears its attempt", async () => {
    const harness = await renderUploads();

    let running: Promise<void> | undefined;
    await act(async () => {
      running = harness.uploads().runUploads([attempt("a")]);
    });
    expect(harness.uploads().uploading).toBe(true);
    expect(harness.uploads().uploadAttempts).toHaveLength(1);

    await act(async () => {
      harness.pending.get("a.md")?.resolve(uploaded("a"));
      await running;
    });

    expect(harness.accepted.map((entry) => entry.filename)).toEqual(["a"]);
    expect(harness.uploads().uploadAttempts).toEqual([]);
    expect(harness.uploads().uploading).toBe(false);
  });

  it("keeps a failed attempt visible with its reason", async () => {
    const harness = await renderUploads();

    let running: Promise<void> | undefined;
    await act(async () => {
      running = harness.uploads().runUploads([attempt("a")]);
    });
    await act(async () => {
      harness.pending.get("a.md")?.reject(new Error("Too large"));
      await running;
    });

    expect(harness.uploads().uploadAttempts).toMatchObject([
      { id: "a", status: "failed", error: "Too large" },
    ]);
    expect(harness.accepted).toEqual([]);
    expect(harness.uploads().uploading).toBe(false);
  });

  it("refuses a second batch while one is in flight", async () => {
    const harness = await renderUploads();

    let running: Promise<void> | undefined;
    await act(async () => {
      running = harness.uploads().runUploads([attempt("a")]);
    });
    await act(async () => {
      await harness.uploads().runUploads([attempt("b")]);
    });

    expect(harness.pending.has("b.md")).toBe(false);
    expect(harness.uploads().uploadAttempts).toHaveLength(1);

    await act(async () => {
      harness.pending.get("a.md")?.resolve(uploaded("a"));
      await running;
    });
  });

  it("drops a result that lands after the conversation changed", async () => {
    const harness = await renderUploads();

    let running: Promise<void> | undefined;
    await act(async () => {
      running = harness.uploads().runUploads([attempt("a")]);
    });
    harness.draftKey.current = "another";
    await act(async () => {
      harness.pending.get("a.md")?.resolve(uploaded("a"));
      await running;
    });

    expect(harness.accepted).toEqual([]);
  });

  it("dismisses one attempt and resets the rest", async () => {
    const harness = await renderUploads();

    let running: Promise<void> | undefined;
    await act(async () => {
      running = harness.uploads().runUploads([attempt("a"), attempt("b")]);
    });
    await act(async () => {
      harness.pending.get("a.md")?.reject(new Error("Too large"));
      harness.pending.get("b.md")?.reject(new Error("Also too large"));
      await running;
    });
    expect(harness.uploads().uploadAttempts).toHaveLength(2);

    await act(async () => harness.uploads().dismissAttempt("a"));
    expect(harness.uploads().uploadAttempts.map((entry) => entry.id)).toEqual([
      "b",
    ]);

    await act(async () => harness.uploads().reset());
    expect(harness.uploads().uploadAttempts).toEqual([]);
    expect(harness.uploads().uploading).toBe(false);
  });
});
