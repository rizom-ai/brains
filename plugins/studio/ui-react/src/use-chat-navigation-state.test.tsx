/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type { StudioChatNavigationState } from "./studio-chat-drafts";
import { useChatNavigationState } from "./use-chat-navigation-state";

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
  windowInstance.close();
  restoreGlobals();
});

interface Props {
  draft?: string;
  uploadCount?: number;
  uploadAttemptCount?: number;
  sending?: boolean;
  uploading?: boolean;
}

async function render(
  reported: StudioChatNavigationState[],
  props: Props,
): Promise<void> {
  function Probe(inner: Props): null {
    useChatNavigationState({
      onChange: (state): void => {
        reported.push(state);
      },
      draft: inner.draft ?? "",
      uploadCount: inner.uploadCount ?? 0,
      uploadAttemptCount: inner.uploadAttemptCount ?? 0,
      sending: inner.sending ?? false,
      uploading: inner.uploading ?? false,
    });
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe, props));
  });
}

describe("useChatNavigationState", () => {
  it("reports nothing to lose for an untouched composer", async () => {
    const reported: StudioChatNavigationState[] = [];

    await render(reported, {});

    expect(reported).toEqual([{ hasDraft: false, busy: false }]);
    await act(async () => root.unmount());
  });

  it("counts an unsent draft, attached uploads and uploads still arriving", async () => {
    for (const props of [
      { draft: "Unsent" },
      { uploadCount: 1 },
      { uploadAttemptCount: 1 },
    ]) {
      const reported: StudioChatNavigationState[] = [];
      await render(reported, props);
      expect(reported.at(-1)?.hasDraft).toBe(true);
      await act(async () => root.unmount());
      const container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    }
  });

  it("is busy while a turn is in flight or a file is uploading", async () => {
    const sendingReports: StudioChatNavigationState[] = [];
    await render(sendingReports, { sending: true });
    expect(sendingReports.at(-1)?.busy).toBe(true);
    await act(async () => root.unmount());

    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const uploadingReports: StudioChatNavigationState[] = [];
    await render(uploadingReports, { uploading: true });
    expect(uploadingReports.at(-1)?.busy).toBe(true);
    await act(async () => root.unmount());
  });

  it("clears on the way out, so a closed workspace holds nothing", async () => {
    const reported: StudioChatNavigationState[] = [];

    await render(reported, { draft: "Unsent", sending: true });
    expect(reported.at(-1)).toEqual({ hasDraft: true, busy: true });

    await act(async () => root.unmount());

    expect(reported.at(-1)).toEqual({ hasDraft: false, busy: false });
  });
});
