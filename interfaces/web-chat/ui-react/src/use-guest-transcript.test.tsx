/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type { ChatHistoryMessage } from "@brains/contracts/chat";
import {
  useGuestTranscript,
  type GuestTranscript,
} from "./use-guest-transcript";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/ask" });
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

function message(id: string, role: "user" | "assistant"): ChatHistoryMessage {
  return { id, role, content: `${role} ${id}` };
}

async function render(): Promise<() => GuestTranscript> {
  let latest: GuestTranscript | undefined;
  function Probe(): ReactElement {
    latest = useGuestTranscript();
    return createElement("div");
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  return (): GuestTranscript => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
}

describe("useGuestTranscript", () => {
  it("starts empty", async () => {
    const transcript = await render();

    expect(transcript().messages).toEqual([]);
    expect(transcript().earlier).toEqual([]);
  });

  it("shows a conversation's history in place of what was on screen", async () => {
    const transcript = await render();
    await act(async () => transcript().show([message("a", "user")]));

    await act(async () => transcript().show([message("b", "assistant")]));

    expect(transcript().messages.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("sets the visible turns aside instead of losing them", async () => {
    const transcript = await render();
    await act(async () =>
      transcript().show([message("a", "user"), message("b", "assistant")]),
    );

    await act(async () => transcript().setAside());

    expect(transcript().messages).toEqual([]);
    expect(transcript().earlier.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("keeps earlier turns from more than one set-aside", async () => {
    const transcript = await render();
    await act(async () => transcript().show([message("a", "user")]));
    await act(async () => transcript().setAside());
    await act(async () => transcript().show([message("b", "user")]));

    await act(async () => transcript().setAside());

    expect(transcript().earlier.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("forgets a restored question when the turns are set aside", async () => {
    const transcript = await render();
    await act(async () => {
      transcript().restoredQuestion.current = "a";
      transcript().show([message("a", "user")]);
    });

    await act(async () => transcript().setAside());

    expect(transcript().restoredQuestion.current).toBeUndefined();
  });

  it("clears the screen without setting anything aside, once it is gone", async () => {
    const transcript = await render();
    await act(async () => transcript().show([message("a", "user")]));

    await act(async () => transcript().clear());

    expect(transcript().messages).toEqual([]);
    expect(transcript().earlier).toEqual([]);
  });
});
