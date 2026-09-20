/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type { GuestChatSessionResponse } from "@brains/contracts/chat";
import { useGuestSession, type GuestSession } from "./use-guest-session";

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
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

function opened(
  overrides: Partial<GuestChatSessionResponse> = {},
): GuestChatSessionResponse {
  return {
    expiresAt: Date.now() + 3_600_000,
    provider: "Mock provider",
    notice: "Do not share sensitive text.",
    deletionLimitations: "Provider records are separate.",
    retention: { idleSeconds: 3600, maxAgeSeconds: 7200 },
    messageCharacters: 4000,
    canSend: true,
    ...overrides,
  };
}

async function render(
  open: (signal: AbortSignal) => Promise<GuestChatSessionResponse>,
): Promise<() => GuestSession> {
  let latest: GuestSession | undefined;
  function Probe(): null {
    latest = useGuestSession({ open });
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  return (): GuestSession => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
}

describe("useGuestSession", () => {
  it("has nothing before a session is opened", async () => {
    const session = await render(() => Promise.resolve(opened()));

    expect(session().session).toBeUndefined();
    expect(session().canSend).toBe(false);
  });

  it("holds the opened session and allows sending", async () => {
    const session = await render(() => Promise.resolve(opened()));

    await act(async () => {
      await session().open(new AbortController().signal);
    });

    expect(session().session?.provider).toBe("Mock provider");
    expect(session().canSend).toBe(true);
  });

  it("denies sending when the brain says the visitor may not", async () => {
    const session = await render(() =>
      Promise.resolve(opened({ canSend: false })),
    );

    await act(async () => {
      await session().open(new AbortController().signal);
    });

    expect(session().session).toBeDefined();
    expect(session().canSend).toBe(false);
  });

  it("reports an elapsed allowance without being told", async () => {
    const session = await render(() =>
      Promise.resolve(opened({ expiresAt: Date.now() - 1000 })),
    );

    await act(async () => {
      await session().open(new AbortController().signal);
    });

    expect(session().hasElapsed()).toBe(true);
    expect(session().expired).toBe(false);
  });

  it("denies sending once the elapsed allowance has been recorded", async () => {
    const session = await render(() => Promise.resolve(opened()));
    await act(async () => {
      await session().open(new AbortController().signal);
    });
    expect(session().canSend).toBe(true);

    await act(async () => session().markExpired());

    expect(session().expired).toBe(true);
    expect(session().canSend).toBe(false);
  });

  it("allows sending again once a new session clears the expiry", async () => {
    const session = await render(() => Promise.resolve(opened()));
    await act(async () => {
      await session().open(new AbortController().signal);
    });
    await act(async () => session().markExpired());

    await act(async () => session().clearExpired());

    expect(session().expired).toBe(false);
    expect(session().canSend).toBe(true);
  });

  it("hands the caller what opening threw, and keeps the previous session", async () => {
    let fail = false;
    const session = await render(() =>
      fail
        ? Promise.reject(new Error("Guest access unavailable"))
        : Promise.resolve(opened()),
    );
    await act(async () => {
      await session().open(new AbortController().signal);
    });

    fail = true;
    let caught: unknown;
    await act(async () => {
      try {
        await session().open(new AbortController().signal);
      } catch (cause) {
        caught = cause;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(session().session?.provider).toBe("Mock provider");
  });
});
