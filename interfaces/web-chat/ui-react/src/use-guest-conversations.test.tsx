/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  installDomGlobals,
  installGlobals,
  type RestoreGlobals,
} from "@brains/test-utils";
import {
  useGuestConversations,
  type GuestConversations,
} from "./use-guest-conversations";

let restoreGlobals: RestoreGlobals;
let restoreStorage: RestoreGlobals | undefined;
let windowInstance: Window;
let root: Root;

const one = `guest-${"a".repeat(64)}`;
const two = `guest-${"b".repeat(64)}`;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/ask" });
  restoreGlobals = installDomGlobals(windowInstance, {
    sessionStorage: windowInstance.sessionStorage,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  restoreStorage?.();
  restoreStorage = undefined;
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

async function render(): Promise<() => GuestConversations> {
  let latest: GuestConversations | undefined;
  function Probe(): null {
    latest = useGuestConversations();
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  return (): GuestConversations => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
}

function stored(): { locator: string | null; list: string | null } {
  return {
    locator: sessionStorage.getItem("brain-ask-conversation"),
    list: sessionStorage.getItem("brain-ask-conversation-list"),
  };
}

describe("useGuestConversations", () => {
  it("remembers a locator as the selection and in this tab's list", async () => {
    const conversations = await render();

    await act(async () => conversations().remember(one));

    expect(conversations().id).toBe(one);
    expect(conversations().conversations).toEqual([one]);
    expect(stored().locator).toBe(one);
  });

  it("adopts what an earlier visit to this tab saved", async () => {
    sessionStorage.setItem("brain-ask-conversation", one);
    sessionStorage.setItem(
      "brain-ask-conversation-list",
      JSON.stringify([one]),
    );
    const conversations = await render();

    let adopted: string | undefined;
    await act(async () => {
      adopted = conversations().adopt();
    });

    expect(adopted).toBe(one);
    expect(conversations().id).toBe(one);
    expect(conversations().conversations).toEqual([one]);
  });

  it("keeps only well-formed guest locators out of storage", async () => {
    sessionStorage.setItem(
      "brain-ask-conversation-list",
      JSON.stringify([one, "not-a-guest-id", 42, `guest-${"a".repeat(10)}`]),
    );
    const conversations = await render();

    await act(async () => {
      conversations().adopt();
    });

    expect(conversations().conversations).toEqual([one]);
  });

  it("drops a locator from the list and the selection when it is gone", async () => {
    const conversations = await render();
    await act(async () => conversations().remember(one));
    await act(async () => conversations().remember(two));
    expect(conversations().conversations).toEqual([one, two]);

    await act(async () => conversations().forget(two));

    expect(conversations().id).toBeUndefined();
    expect(conversations().conversations).toEqual([one]);
    expect(stored().locator).toBeNull();
  });

  it("clears the selection without losing the list", async () => {
    const conversations = await render();
    await act(async () => conversations().remember(one));

    await act(async () => conversations().clear());

    expect(conversations().id).toBeUndefined();
    expect(conversations().conversations).toEqual([one]);
    expect(stored().locator).toBeNull();
  });

  it("reports whether a locator is the one this tab persisted", async () => {
    const conversations = await render();
    await act(async () => conversations().remember(one));

    expect(conversations().isSaved(one)).toBe(true);
    expect(conversations().isSaved(two)).toBe(false);
  });

  it("keeps working when storage is unavailable, and persists nothing", async () => {
    const denied = (): never => {
      throw new Error("Storage blocked");
    };
    restoreStorage = installGlobals({
      sessionStorage: { getItem: denied, setItem: denied, removeItem: denied },
    });
    const conversations = await render();

    await act(async () => conversations().remember(one));

    // The selection still works in memory; nothing reached storage.
    expect(conversations().id).toBe(one);
    expect(conversations().conversations).toEqual([one]);
    expect(conversations().isSaved(one)).toBe(false);
  });
});
