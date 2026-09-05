/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import { TypeSwitcher } from "./entity-fields";

let browser: Window;
let root: Root;
let selected: string[];
const capabilities: EntityTypeInfo["capabilities"] = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canExtract: false,
  canPublish: false,
  canAssist: false,
};
const types: EntityTypeInfo[] = [
  {
    entityType: "note",
    label: "Notes",
    isSingleton: false,
    hasBody: true,
    count: 12,
    capabilities,
  },
  {
    entityType: "style-guide",
    label: "Style Guides",
    isSingleton: true,
    hasBody: true,
    count: 1,
    capabilities,
  },
  {
    entityType: "prompt",
    label: "Prompts",
    isSingleton: false,
    hasBody: true,
    count: 18,
    capabilities,
  },
  {
    entityType: "agent",
    label: "Agents",
    isSingleton: false,
    hasBody: true,
    count: 15,
    capabilities,
  },
];
const workspaces: StudioWorkspaceInfo[] = [
  {
    id: "studio:overview",
    pluginId: "studio",
    label: "Overview",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: -100,
    permission: "trusted",
    entityTypes: [],
  },
  {
    id: "web-chat:chat",
    pluginId: "web-chat",
    label: "Chat",
    rendererName: "StudioChatWorkspace",
    priority: -80,
    permission: "trusted",
    entityTypes: [],
  },
  {
    id: "inbox:inbox",
    pluginId: "inbox",
    label: "Inbox",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 10,
    permission: "trusted",
    entityTypes: [],
  },
];

beforeEach(() => {
  browser = new Window({ url: "http://brain.test/studio/entities/note" });
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    Element: browser.Element,
    Node: browser.Node,
    Event: browser.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  selected = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  browser.close();
});
async function render(
  active: string | null = "note",
  activeWorkspace: string | null = null,
): Promise<void> {
  await act(async () =>
    root.render(
      <TypeSwitcher
        renderMode="desktop"
        types={types}
        active={active}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onSelect={(id) => selected.push(id)}
        onSelectWorkspace={(id) => selected.push(id)}
      />,
    ),
  );
}
async function click(selector: string, text: string): Promise<void> {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>(selector),
  ].find((node) => node.textContent.includes(text));
  if (!button) throw new Error(`Missing ${selector}: ${text}`);
  await act(async () => button.click());
}
const leafText = (): string | null | undefined =>
  document.querySelector(".studio-leaf-rail")?.textContent;
const currentArea = (): string | null | undefined =>
  document.querySelector('.studio-area-link[aria-pressed="true"]')?.textContent;

describe("area and leaf navigation", () => {
  it("collapses only on request and preserves that choice through destinations and remounts", async () => {
    await render();
    await click(".studio-navigation-collapse", "⇤");
    expect(
      document
        .querySelector(".studio-navigation-collapse")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(window.localStorage.getItem("studio.navigation.collapsed")).toBe(
      "true",
    );
    await render("style-guide");
    expect(
      document
        .querySelector(".studio-navigation-collapse")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    await act(async () => root.render(null));
    await render(null, "web-chat:chat");
    expect(
      document
        .querySelector(".studio-navigation-collapse")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    await click(".studio-area-link", "Library");
    expect(
      document
        .querySelector(".studio-navigation-collapse")
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(currentArea()).toContain("Library");
    expect(selected).toEqual([]);
  });

  it("still supports explicit collapse when preference storage is blocked", async () => {
    Object.defineProperty(window.localStorage, "setItem", {
      value: () => {
        throw new Error("Storage blocked");
      },
    });
    await render();
    await click(".studio-navigation-collapse", "⇤");
    expect(
      document
        .querySelector(".studio-navigation-collapse")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    await click(".studio-navigation-collapse", "⇥");
    expect(
      document
        .querySelector(".studio-navigation-collapse")
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
  });
  it("keeps B's numbered area items, singular singleton labels and Commands footer", async () => {
    await render("style-guide");
    expect(
      [...document.querySelectorAll(".studio-area-link b")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["00", "01", "02", "03"]);
    expect(document.querySelector(".studio-area-rail em")).toBeNull();
    expect(
      document.querySelector(".studio-area-rail .command-chip")?.textContent,
    ).toContain("Commands");
    expect(
      document.querySelector('.studio-leaf-link[aria-current="page"]')
        ?.textContent,
    ).toBe("Style Guidesolo");
    expect(leafText()?.indexOf("Identity")).toBeLessThan(
      leafText()?.indexOf("Intelligence") ?? 0,
    );
    expect(leafText()?.indexOf("Intelligence")).toBeLessThan(
      leafText()?.indexOf("Network") ?? 0,
    );
  });
  it("browses Work without opening Chat, fetching a destination or replacing the current document", async () => {
    await render();
    await click(".studio-area-link", "Work");
    expect(selected).toEqual([]);
    expect(currentArea()).toContain("Work");
    expect(leafText()).toContain("Chat");
    expect(leafText()).toContain("Inbox");
    await render(); // A badge/data refresh must not undo intentional browsing.
    expect(currentArea()).toContain("Work");
    await click(".studio-leaf-link", "Inbox");
    expect(selected).toEqual(["inbox:inbox"]);
  });

  it("keeps the leaf beside Chat so Work destinations remain reachable", async () => {
    await render(null, "web-chat:chat");
    expect(currentArea()).toContain("Work");
    expect(leafText()).toContain("Inbox");
    expect(
      document.querySelector('.studio-leaf-link[aria-current="page"]')
        ?.textContent,
    ).toBe("Chat");
    await click(".studio-area-link", "System");
    expect(selected).toEqual([]);
    await click(".studio-leaf-link", "Style Guide");
    expect(selected).toEqual(["style-guide"]);
  });

  it("restores the owning area when the route changes, including a return to a previous route", async () => {
    await render();
    await click(".studio-area-link", "Work");
    await render("style-guide");
    expect(currentArea()).toContain("System");
    expect(leafText()).toContain("Identity");
    expect(leafText()).toContain("Intelligence");
    expect(leafText()).toContain("Network");
    await render();
    expect(currentArea()).toContain("Library");
  });

  it("keeps browsing intact when a destination change is blocked by an unsaved draft", async () => {
    await render();
    await click(".studio-area-link", "System");
    await click(".studio-leaf-link", "Style Guide");
    await render(); // The guarded router has not accepted the request.
    expect(currentArea()).toContain("System");
    expect(selected).toEqual(["style-guide"]);
    await click(".studio-area-link", "Library");
    expect(
      document.querySelector('.studio-leaf-link[aria-current="page"]')
        ?.textContent,
    ).toContain("Notes");
  });

  it("treats Overview as the explicit home destination, not an arbitrary first leaf", async () => {
    await render();
    await click(".studio-area-link", "Overview");
    expect(selected).toEqual(["studio:overview"]);
  });
});
