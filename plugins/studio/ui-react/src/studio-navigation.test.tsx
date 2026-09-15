/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import {
  StudioBrowseDestinations,
  studioArea,
  TypeSwitcher,
} from "./entity-fields";
import { StudioChrome } from "./studio-chrome";

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
    id: "admin:administration",
    pluginId: "admin",
    label: "Administration",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 100,
    permission: "admin",
    entityTypes: [],
  },
  {
    id: "studio:account",
    pluginId: "studio",
    label: "Account",
    rendererName: "StudioAccountWorkspace",
    priority: 110,
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
    HTMLInputElement: browser.HTMLInputElement,
    Element: browser.Element,
    Node: browser.Node,
    Event: browser.Event,
    CustomEvent: browser.CustomEvent,
    // Radix needs these to mount a dialog.
    MutationObserver: browser.MutationObserver,
    ResizeObserver: browser.ResizeObserver,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    getComputedStyle: browser.getComputedStyle.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  selected = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  await browser.happyDOM.abort();
  browser.close();
});
async function render(
  active: string | null = "note",
  activeWorkspace: string | null = null,
  availableWorkspaces = workspaces,
): Promise<void> {
  await act(async () =>
    root.render(
      <TypeSwitcher
        renderMode="desktop"
        types={types}
        active={active}
        workspaces={availableWorkspaces}
        workspaceBadges={Object.fromEntries(
          availableWorkspaces.map((workspace) => [
            workspace.id,
            workspace.badge ?? 0,
          ]),
        )}
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

async function renderChrome(id: string, label: string): Promise<void> {
  await act(async () =>
    root.render(
      <StudioChrome
        contextLabel={label}
        navigation={{
          types,
          workspaces,
          activeEntityType: null,
          activeWorkspaceId: id,
          workspaceBadges: {},
          selectEntityType: (value) => selected.push(value),
          selectWorkspace: (value) => selected.push(value),
        }}
      />,
    ),
  );
}

describe("profile navigation", () => {
  it.each([
    ["web-chat:chat", "Chat"],
    ["admin:administration", "Administration"],
    ["studio:account", "Account"],
  ])("does not invent a parent breadcrumb for %s", async (id, label) => {
    await renderChrome(id, label);
    expect(document.querySelector(".studio-chrome-location")?.textContent).toBe(
      label,
    );
  });
});

function browseGroups(): {
  area: string;
  label: string;
  options: {
    value: string;
    label: string;
    tally?: number;
    attention?: number;
    accessibleLabel?: string;
  }[];
}[] {
  return [
    {
      area: "overview",
      label: "Home",
      options: [
        {
          value: "workspace:studio:overview",
          label: "Overview",
          accessibleLabel: "Overview",
          attention: 2,
        },
      ],
    },
    {
      area: "chat",
      label: "Chat",
      options: [
        {
          value: "workspace:web-chat:chat",
          label: "Chat",
          accessibleLabel: "Chat",
        },
      ],
    },
    {
      area: "library",
      label: "Library",
      options: [{ value: "type:note", label: "Notes", tally: 12 }],
    },
    {
      area: "work",
      label: "Work",
      options: [
        {
          value: "workspace:unified-inbox:inbox",
          label: "Inbox",
          attention: 3,
        },
      ],
    },
    {
      area: "administration",
      label: "Admin",
      options: [
        {
          value: "workspace:admin:administration",
          label: "Administration",
          accessibleLabel: "Administration",
          attention: 1,
        },
      ],
    },
    {
      area: "system",
      label: "System",
      options: [
        { value: "type:prompt", label: "Prompts", tally: 18 },
        { value: "type:agent", label: "Agents", tally: 15 },
      ],
    },
  ];
}

async function renderBrowse(filter = "", folded: string[] = []): Promise<void> {
  const state = { filter, folded: new Set(folded) };
  const draw = async (): Promise<void> => {
    await act(async () =>
      root.render(
        <StudioBrowseDestinations
          groups={browseGroups()}
          filter={state.filter}
          activeValue="type:note"
          groupId={(area) => `browse-${area}`}
          isGroupOpen={(area) => !state.folded.has(area)}
          onFilterChange={(value) => {
            state.filter = value;
            void draw();
          }}
          onToggleGroup={(area, open) => {
            if (open) state.folded.delete(area);
            else state.folded.add(area);
            void draw();
          }}
          onSelect={(value) => selected.push(value)}
        />,
      ),
    );
  };
  await draw();
}
const clean = (text: string): string =>
  text.replace(/[0-9\u25b8\u25be]/g, "").trim();
const browseLinks = (): string[] =>
  [...document.querySelectorAll(".studio-mobile-navigation-link")].map((link) =>
    link.textContent.trim(),
  );

describe("phone Browse destinations", () => {
  it("puts every single destination above the toggles", async () => {
    await renderBrowse();
    const blocks = [...document.querySelectorAll("section, details")].map(
      (block) =>
        block.tagName === "SECTION"
          ? `direct:${clean(block.textContent)}`
          : `group:${clean(block.querySelector("summary")?.textContent ?? "")}`,
    );
    expect(blocks).toEqual([
      "direct:OverviewChatAdministration",
      "group:Library",
      "group:Work",
      "group:System",
    ]);
  });

  it("marks a single destination by treatment as well as position", async () => {
    await renderBrowse();
    const admin = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Administration",
    );
    const child = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Inbox"),
    );
    // Group children indent; a direct destination sits flush, so Admin cannot
    // read as the last row of the Work group above it.
    expect(admin?.closest("details")).toBeNull();
    expect(child?.closest("details")).not.toBeNull();
  });

  it("rests every group open so the sheet shows what it is for", async () => {
    await renderBrowse();
    const groups = [...document.querySelectorAll("details")];
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.open)).toBe(true);
  });

  it("keeps naming the destination inside a folded group", async () => {
    await renderBrowse("", ["library"]);
    const library = [...document.querySelectorAll("details")].find((group) =>
      group.querySelector("summary")?.textContent.includes("Library"),
    );
    expect(library?.open).toBe(false);
    expect(library?.querySelector("summary")?.textContent).toContain("Notes");
    expect(selected).toHaveLength(0);
  });

  it("separates an attention count from an item tally", async () => {
    await renderBrowse();
    const overview = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Overview",
    );
    const notes = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Notes"),
    );
    expect(
      overview?.querySelector("[data-studio-attention]")?.textContent,
    ).toBe("2");
    expect(overview?.querySelector("[data-studio-tally]")).toBeNull();
    expect(notes?.querySelector("[data-studio-tally]")?.textContent).toBe("12");
    expect(notes?.querySelector("[data-studio-attention]")).toBeNull();
  });

  it("narrows destinations across every group, opening the ones that match", async () => {
    await renderBrowse("age", ["system"]);
    expect(browseLinks()).toEqual(["Agents15"]);
    // A folded group still shows what the filter found in it.
    expect(
      [...document.querySelectorAll("details")].every((group) => group.open),
    ).toBe(true);
  });

  it("says so when the filter matches nothing", async () => {
    await renderBrowse("nothing matches this");
    expect(document.body.textContent).toContain("No destination matches");
    expect(browseLinks()).toHaveLength(0);
  });

  it("keeps Account out of Browse and spends no display line naming the sheet", async () => {
    await renderBrowse();
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent.trim() === "Account",
      ),
    ).toBe(false);
    expect(document.querySelector("header h2")).toBeNull();
  });

  it("reports the chosen destination without closing anything itself", async () => {
    await renderBrowse();
    const notes = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Notes"),
    );
    await act(async () => notes?.click());
    expect(selected).toEqual(["type:note"]);
  });
});

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
  it("gives collapsed areas distinct decorative marks without losing names or routing", async () => {
    await render("style-guide");
    await click(".studio-navigation-collapse", "⇤");
    const areas = [...document.querySelectorAll(".studio-area-link")];
    expect(areas).toHaveLength(6);
    const paths = new Set<string>();
    for (const area of areas) {
      const mark = area.querySelector("svg");
      expect(mark).not.toBeNull();
      expect(mark?.getAttribute("aria-hidden")).toBe("true");
      expect(mark?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(area.getAttribute("title")).toBe(area.getAttribute("aria-label"));
      paths.add(mark?.querySelector("path")?.getAttribute("d") ?? "");
    }
    expect(paths.size).toBe(6);
    await click('.studio-area-link[aria-label="Library"]', "");
    expect(leafText()).toContain("Content");
  });

  it("keeps B's numbered area items, singular singleton labels and Commands footer", async () => {
    await render("style-guide");
    expect(
      [...document.querySelectorAll(".studio-area-link b")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["00", "01", "02", "03", "04", "05"]);
    expect(
      [...document.querySelectorAll(".studio-area-link span")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Overview", "Chat", "Library", "Work", "Admin", "System"]);
    expect(document.querySelector(".studio-area-rail em")).toBeNull();
    expect(
      document.querySelector(".studio-area-rail .command-chip")?.textContent,
    ).toContain("Commands");
    expect(
      document.querySelector('.studio-leaf-link[aria-current="page"]')
        ?.textContent,
    ).toBe("Style Guide");
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
    expect(leafText()).not.toContain("Chat");
    expect(leafText()).not.toContain("Administration");
    expect(leafText()).not.toContain("Account");
    expect(leafText()).toContain("Inbox");
    await render(); // A badge/data refresh must not undo intentional browsing.
    expect(currentArea()).toContain("Work");
    await click(".studio-leaf-link", "Inbox");
    expect(selected).toEqual(["inbox:inbox"]);
  });

  it.each([
    ["web-chat:chat", "Chat"],
    ["admin:administration", "Admin"],
  ])(
    "opens %s directly without a redundant leaf or losing collapse",
    async (id, label) => {
      await render();
      await click(".studio-navigation-collapse", "⇤");
      await click(".studio-area-link", label);
      expect(selected).toEqual([id]);
      await render(null, id);
      expect(currentArea()).toContain(label);
      expect(document.querySelector(".studio-leaf-rail")).toBeNull();
      expect(
        document
          .querySelector(".studio-navigation")
          ?.getAttribute("data-leaf-open"),
      ).toBe("false");
      expect(window.localStorage.getItem("studio.navigation.collapsed")).toBe(
        "true",
      );
      await click(".studio-area-link", "Work");
      expect(leafText()).toContain("Inbox");
      expect(window.localStorage.getItem("studio.navigation.collapsed")).toBe(
        "false",
      );
      await click(".studio-area-link", label);
      expect(document.querySelector(".studio-leaf-rail")).toBeNull();
      expect(selected).toEqual([id]); // Same-page clicks do not reset session/tab queries.
    },
  );

  it("leaves Account outside all rail areas, but still lets it browse destinations", async () => {
    await render(null, "studio:account");
    expect(studioArea(null, "studio:account")).toBeNull();
    expect(currentArea()).toBeUndefined();
    expect(document.querySelector(".studio-leaf-rail")).toBeNull();
    expect(
      document.querySelector(".studio-navigation")?.textContent,
    ).not.toContain("Account");
    await click(".studio-area-link", "System");
    expect(leafText()).toContain("Identity");
    expect(leafText()).not.toContain("Account");
    expect(leafText()).not.toContain("Administration");
  });

  it("does not expose Chat or Admin unless the admitted workspace list contains them", async () => {
    await render(
      "note",
      null,
      workspaces.filter(
        (workspace) =>
          !["web-chat:chat", "admin:administration"].includes(workspace.id),
      ),
    );
    expect(
      document.querySelector(".studio-area-rail")?.textContent,
    ).not.toContain("Chat");
    expect(
      document.querySelector(".studio-area-rail")?.textContent,
    ).not.toContain("Admin");
  });

  it("preserves admitted attention counts on primary destinations, including the collapsed rail", async () => {
    await render(
      "note",
      null,
      workspaces.map((workspace) =>
        workspace.id === "admin:administration"
          ? { ...workspace, badge: 2 }
          : workspace,
      ),
    );
    const admin = document.querySelector(
      '.studio-area-link[aria-label="Administration"]',
    );
    expect(admin?.querySelector("small")?.textContent).toBe("2");
    expect(admin?.getAttribute("aria-description")).toBe("2 need attention");
    await click(".studio-navigation-collapse", "⇤");
    expect(admin?.getAttribute("aria-description")).toBe("2 need attention");
  });

  it("does not change browsing when a guarded direct destination is rejected", async () => {
    await render();
    await click(".studio-area-link", "System");
    await click(".studio-area-link", "Admin");
    await render();
    expect(selected).toEqual(["admin:administration"]);
    expect(currentArea()).toContain("System");
    expect(leafText()).toContain("Identity");
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
