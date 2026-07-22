import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
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
              href: "/cms/entities/note/verdigris-pigments",
              tag: "edit in cms",
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

  const fetchStub = (input: string): Promise<Response> => {
    fetchCalls.push(String(input));
    const { status, body } = fetchResponse();
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  Object.assign(globalThis, {
    window,
    document: window.document,
    KeyboardEvent: window.KeyboardEvent,
  });
  window.fetch = fetchStub as unknown as typeof window.fetch;
  globalThis.fetch = fetchStub as unknown as typeof globalThis.fetch;

  eval(CONSOLE_PALETTE_SCRIPT);
});

afterEach(() => {
  window.close();
  delete (globalThis as Record<string, unknown>)["window"];
  delete (globalThis as Record<string, unknown>)["document"];
  delete (globalThis as Record<string, unknown>)["KeyboardEvent"];
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
      "edit in cms",
    );
    expect(
      window.document.querySelector(".cp-row .cp-glyph")?.textContent,
    ).toBe("◆");
    expect(window.document.querySelectorAll(".cp-group")).toHaveLength(2);
  });

  it("debounces typed queries into encoded requests", async () => {
    await openPalette();
    const input = window.document.querySelector(
      ".cp-input",
    ) as unknown as HTMLInputElement;
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
    const input = window.document.querySelector(".cp-input") as Element;

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
      "/cms/entities/note/verdigris-pigments",
      "/#publishing",
      "/#system",
    ]);
  });

  it("closes on Escape and reopens from the strip's command chip", async () => {
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
    (window as unknown as Record<string, unknown>)["__consoleJumpLocal"] = (
      query: string,
    ): unknown => [
      {
        label: "Conversations",
        items: [
          { title: `About ${query || "everything"}`, href: "/chat#s/abc" },
        ],
      },
    ];

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
