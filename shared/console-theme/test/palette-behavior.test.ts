import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import type { Element } from "happy-dom";
import { CONSOLE_PALETTE_SCRIPT } from "../src";

/**
 * Executes the palette script in a real DOM and drives it like a user:
 * open with the keyboard or the strip's command chip, type, arrow through
 * results, and follow a door.
 */

interface JumpGroups {
  groups: Array<{
    label: string;
    items: Array<{ title: string; href: string; sub?: string; tag?: string }>;
  }>;
}

/**
 * The one property a hosting surface is allowed to add to the window for the
 * palette to find. Named rather than cast so the contract between the palette
 * script and its host is stated somewhere a reader can find it.
 */
interface ConsoleJumpHost {
  __consoleJumpLocal?: (query: string) => unknown;
}

function setConsoleJumpLocal(
  target: Window,
  local: NonNullable<ConsoleJumpHost["__consoleJumpLocal"]>,
): void {
  // Reflect rather than an intersection cast: the host genuinely adds a
  // property the Window type does not declare, and setting it through Reflect
  // says so instead of claiming the window already had it.
  Reflect.set(target, "__consoleJumpLocal", local);
}

/**
 * Narrow by instanceof rather than casting. happy-dom builds its own element
 * classes, so a cast to the global `HTMLInputElement` asserts a relationship
 * that does not exist — and it would keep passing if the selector stopped
 * matching an input at all, which is the failure the cast was hiding.
 */
function requireInput(
  win: Window,
  selector: string,
): InstanceType<Window["HTMLInputElement"]> {
  const element = win.document.querySelector(selector);
  if (!(element instanceof win.HTMLInputElement)) {
    throw new Error(selector + " did not match an input element");
  }
  return element;
}

let window: Window;
let fetchCalls: string[];
let fetchResponse: () => { status: number; body: JumpGroups };

function keydown(key: string, init: { metaKey?: boolean } = {}): void {
  window.document.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
}

function overlay(): Element | null {
  return window.document.querySelector(".console-palette-overlay");
}

function rowTitles(): string[] {
  return [...window.document.querySelectorAll(".cp-row .cp-title")].map(
    (el) => el.textContent,
  );
}

function selectedTitle(): string | null {
  return (
    window.document.querySelector(".cp-row.is-selected .cp-title")
      ?.textContent ?? null
  );
}

async function settle(): Promise<void> {
  // Covers the 150ms input debounce plus fetch microtasks.
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function openPalette(): Promise<void> {
  keydown("k", { metaKey: true });
  await settle();
}

beforeEach(() => {
  window = new Window({ url: "http://brain.test/" });
  fetchCalls = [];
  fetchResponse = (): { status: number; body: JumpGroups } => ({
    status: 200,
    body: {
      groups: [
        {
          label: "Entities",
          items: [
            {
              title: "Verdigris pigments",
              sub: "note",
              href: "/studio/entities/note/verdigris-pigments",
              tag: "edit in studio",
            },
          ],
        },
        {
          label: "Dashboard",
          items: [
            { title: "Publishing", href: "/#publishing", tag: "dashboard" },
            { title: "System", href: "/#system", tag: "dashboard" },
          ],
        },
      ],
    },
  });

  // Typed as fetch is, so it can be installed without an assertion. The
  // script under test ships to browsers and calls the global directly, so
  // replacing the global is the only seam there is.
  const respond = (input: string | Request | URL): Promise<Response> => {
    fetchCalls.push(String(input));
    const { status, body } = fetchResponse();
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  // fetch carries a static preconnect, so a bare function is not a stand-in
  // for it. Attaching one lets the stub be installed without an assertion.
  const fetchStub: typeof globalThis.fetch = Object.assign(respond, {
    preconnect: (): void => {},
  });

  Object.assign(globalThis, {
    window,
    document: window.document,
    KeyboardEvent: window.KeyboardEvent,
  });
  // Only the global: the script is eval'd in this realm, so its bare fetch
  // resolves here. Assigning window.fetch as well would need a second stub,
  // since happy-dom declares its own Request type.
  globalThis.fetch = fetchStub;

  eval(CONSOLE_PALETTE_SCRIPT);
});

afterEach(() => {
  window.close();
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "KeyboardEvent");
});

describe("console palette behavior", () => {
  it("opens on cmd-K, queries the endpoint, and renders grouped doors", async () => {
    expect(overlay()).toBeNull();

    await openPalette();

    expect(overlay()?.classList.contains("is-open")).toBe(true);
    expect(fetchCalls[0]).toBe("/api/console/jump?q=");
    expect(rowTitles()).toEqual(["Verdigris pigments", "Publishing", "System"]);
    expect(selectedTitle()).toBe("Verdigris pigments");
    expect(window.document.querySelector(".cp-row .cp-tag")?.textContent).toBe(
      "edit in studio",
    );
    expect(
      window.document.querySelector(".cp-row .cp-glyph")?.textContent,
    ).toBe("◆");
    expect(window.document.querySelectorAll(".cp-group")).toHaveLength(2);
  });

  it("debounces typed queries into encoded requests", async () => {
    await openPalette();
    const input = requireInput(window, ".cp-input");
    input.value = "verd igris";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await settle();

    expect(fetchCalls.at(-1)).toBe("/api/console/jump?q=verd%20igris");

    input.value = "verd";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await settle();
    expect(window.document.querySelector(".cp-title mark")?.textContent).toBe(
      "Verd",
    );
  });

  it("moves the selection with arrows and wraps around", async () => {
    await openPalette();
    const input = requireInput(window, ".cp-input");

    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(selectedTitle()).toBe("Publishing");

    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(selectedTitle()).toBe("System");
  });

  it("renders doors as plain links so Enter and click share one path", async () => {
    await openPalette();

    const hrefs = [...window.document.querySelectorAll(".cp-row")].map((row) =>
      row.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/studio/entities/note/verdigris-pigments",
      "/#publishing",
      "/#system",
    ]);
  });

  it("closes on Escape and reopens from a surface command trigger", async () => {
    await openPalette();
    keydown("Escape");
    expect(overlay()?.classList.contains("is-open")).toBe(false);

    const chip = window.document.createElement("button");
    chip.className = "command-chip";
    window.document.body.appendChild(chip);
    chip.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await settle();
    expect(overlay()?.classList.contains("is-open")).toBe(true);
  });

  it("offers the sign-in door on 401", async () => {
    fetchResponse = (): { status: number; body: JumpGroups } => ({
      status: 401,
      body: { groups: [] },
    });

    await openPalette();

    expect(rowTitles()).toEqual(["Sign in to search the console"]);
    expect(window.document.querySelector(".cp-row")?.getAttribute("href")).toBe(
      "/login?return_to=%2F",
    );
  });

  it("appends the hosting surface's local groups", async () => {
    setConsoleJumpLocal(window, (query: string): unknown => [
      {
        label: "Conversations",
        items: [
          { title: `About ${query || "everything"}`, href: "/chat#s/abc" },
        ],
      },
    ]);

    await openPalette();

    expect(rowTitles()).toContain("About everything");
  });

  it("shows an empty state instead of stale rows", async () => {
    fetchResponse = (): { status: number; body: JumpGroups } => ({
      status: 200,
      body: { groups: [] },
    });

    await openPalette();

    expect(rowTitles()).toEqual([]);
    expect(window.document.querySelector(".cp-empty")?.textContent).toContain(
      "Nothing matches",
    );
  });
});
