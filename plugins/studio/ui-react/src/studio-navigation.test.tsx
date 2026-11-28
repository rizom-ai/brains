/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import { StudioChrome } from "./studio-chrome";
import { studioTypeHierarchy } from "../../src/config";
import { StudioBrowseDestinations } from "./studio-navigation-parts";
import { studioArea } from "./studio-areas";
import { TypeSwitcher } from "./studio-type-navigation";

let restoreGlobals: RestoreGlobals;
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
    classification: "content",
    label: "Notes",
    singularLabel: "Note",
    isSingleton: false,
    hasBody: true,
    count: 12,
    hierarchy: studioTypeHierarchy("note"),
    capabilities,
  },
  {
    entityType: "style-guide",
    classification: "system",
    label: "Style Guides",
    singularLabel: "Style Guide",
    isSingleton: true,
    hasBody: true,
    count: 1,
    hierarchy: studioTypeHierarchy("style-guide"),
    capabilities,
  },
  {
    entityType: "prompt",
    classification: "system",
    label: "Prompts",
    singularLabel: "Prompt",
    isSingleton: false,
    hasBody: true,
    count: 18,
    hierarchy: studioTypeHierarchy("prompt"),
    capabilities,
  },
  {
    entityType: "agent",
    classification: "system",
    label: "Agents",
    singularLabel: "Agent",
    isSingleton: false,
    hasBody: true,
    count: 15,
    hierarchy: studioTypeHierarchy("agent"),
    capabilities,
  },
];
const workspaces: StudioWorkspaceInfo[] = [
  {
    id: "studio:overview",
    section: "home",
    pluginId: "studio",
    label: "Overview",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: -100,
    permission: "trusted",
    entityTypes: [],
  },
  {
    id: "web-chat:chat",
    section: "chat",
    pluginId: "web-chat",
    label: "Chat",
    rendererName: "StudioChatWorkspace",
    priority: -80,
    permission: "trusted",
    entityTypes: [],
  },
  {
    id: "admin:administration",
    section: "brain",
    pluginId: "admin",
    label: "Administration",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 100,
    permission: "admin",
    entityTypes: [],
  },
  {
    id: "studio:account",
    section: "brain",
    pluginId: "studio",
    label: "Account",
    rendererName: "StudioAccountWorkspace",
    priority: 110,
    permission: "trusted",
    entityTypes: [],
  },
  {
    id: "content-pipeline:publishing",
    section: "publish",
    pluginId: "content-pipeline",
    label: "Publishing",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 40,
    permission: "trusted",
    entityTypes: [],
  },
  {
    id: "inbox:inbox",
    section: "home",
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
  restoreGlobals = installDomGlobals(browser, {
    HTMLInputElement: browser.HTMLInputElement,
    MouseEvent: browser.MouseEvent,
    Event: browser.Event,
    CustomEvent: browser.CustomEvent,
    // Radix needs these to mount a dialog.
    MutationObserver: browser.MutationObserver,
    ResizeObserver: browser.ResizeObserver,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    getComputedStyle: browser.getComputedStyle.bind(browser),
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
  restoreGlobals();
});
async function render(
  active: string | null = "note",
  activeWorkspace: string | null = null,
  availableWorkspaces = workspaces,
  focus = false,
): Promise<void> {
  await act(async () =>
    root.render(
      <TypeSwitcher
        renderMode="desktop"
        focus={focus}
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
    href: string;
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
          href: "/studio/workspaces/studio%3Aoverview",
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
          href: "/chat",
          label: "Chat",
          accessibleLabel: "Chat",
        },
      ],
    },
    {
      area: "library",
      label: "Library",
      options: [
        {
          value: "type:note",
          href: "/studio/entities/note",
          label: "Notes",
          tally: 12,
        },
      ],
    },
    {
      area: "work",
      label: "Work",
      options: [
        {
          value: "workspace:unified-inbox:inbox",
          href: "/studio/workspaces/unified-inbox%3Ainbox",
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
          href: "/studio/workspaces/admin%3Aadministration",
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
        {
          value: "type:prompt",
          href: "/studio/entities/prompt",
          label: "Prompts",
          tally: 18,
        },
        {
          value: "type:agent",
          href: "/studio/entities/agent",
          label: "Agents",
          tally: 15,
        },
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
  it("makes every destination a link the browser can open elsewhere", async () => {
    await renderBrowse();
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        "a.studio-mobile-navigation-link",
      ),
    ];
    expect(links.map((link) => link.getAttribute("href"))).toContain("/chat");
    const notes = links.find((link) => link.textContent.includes("Notes"));
    expect(notes?.getAttribute("href")).toBe("/studio/entities/note");
    await act(async () =>
      notes?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, metaKey: true }),
      ),
    );
    expect(selected).toEqual([]);
    await act(async () => notes?.click());
    expect(selected).toEqual(["type:note"]);
  });

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
    const admin = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".studio-mobile-navigation-link",
      ),
    ].find((button) => button.getAttribute("aria-label") === "Administration");
    const child = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".studio-mobile-navigation-link",
      ),
    ].find((button) => button.textContent.includes("Inbox"));
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
    const overview = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".studio-mobile-navigation-link",
      ),
    ].find((button) => button.getAttribute("aria-label") === "Overview");
    const notes = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".studio-mobile-navigation-link",
      ),
    ].find((button) => button.textContent.includes("Notes"));
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
      [
        ...document.querySelectorAll<HTMLAnchorElement>(
          ".studio-mobile-navigation-link",
        ),
      ].some((button) => button.textContent.trim() === "Account"),
    ).toBe(false);
    expect(document.querySelector("header h2")).toBeNull();
  });

  it("reports the chosen destination without closing anything itself", async () => {
    await renderBrowse();
    const notes = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".studio-mobile-navigation-link",
      ),
    ].find((button) => button.textContent.includes("Notes"));
    await act(async () => notes?.click());
    expect(selected).toEqual(["type:note"]);
  });
});

describe("area and leaf navigation", () => {
  it("folds to its rail while an entry is open, without changing the preference", async () => {
    await render("note", null, workspaces, true);
    const navigation = (): Element | null =>
      document.querySelector(".studio-navigation");
    expect(navigation()?.getAttribute("data-collapsed")).toBe("true");
    expect(leafText() ?? "").not.toContain("Notes");
    // Browsing an area opens the navigation over the entry, in place.
    await click(".studio-area-link", "Library");
    expect(navigation()?.getAttribute("data-collapsed")).toBe("false");
    expect(leafText()).toContain("Notes");
    expect(selected).toEqual([]);
    expect(
      browser.localStorage.getItem("studio.navigation.collapsed"),
    ).not.toBe("true");
    // The fold control ends the browse; it does not store a preference.
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(".studio-navigation-collapse")
        ?.click(),
    );
    expect(navigation()?.getAttribute("data-collapsed")).toBe("true");
    expect(
      browser.localStorage.getItem("studio.navigation.collapsed"),
    ).not.toBe("true");
    // …and it opens the navigation again from the rail.
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(".studio-navigation-collapse")
        ?.click(),
    );
    expect(navigation()?.getAttribute("data-collapsed")).toBe("false");
    // Opening another entry returns to the rail.
    await render("prompt", null, workspaces, true);
    expect(navigation()?.getAttribute("data-collapsed")).toBe("true");
  });

  it("keeps the leaf beside a collection, which is not an entry", async () => {
    await render("note");
    expect(
      document
        .querySelector(".studio-navigation")
        ?.getAttribute("data-collapsed"),
    ).toBe("false");
    expect(leafText()).toContain("Notes");
  });

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
  it("gives each section a distinct decorative mark without losing names or routing", async () => {
    await render("style-guide");
    await click(".studio-navigation-collapse", "⇤");
    const sections = [...document.querySelectorAll(".studio-area-link")];
    expect(sections).toHaveLength(5);
    const paths = new Set<string>();
    for (const section of sections) {
      const mark = section.querySelector("svg");
      expect(mark).not.toBeNull();
      expect(mark?.getAttribute("aria-hidden")).toBe("true");
      expect(mark?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(section.getAttribute("title")).toBe(
        section.getAttribute("aria-label"),
      );
      paths.add(mark?.querySelector("path")?.getAttribute("d") ?? "");
    }
    expect(paths.size).toBe(5);
    await click('.studio-area-link[aria-label="Library"]', "");
    // Library lists its types as one list, without headings over them.
    expect(leafText()).toContain("Notes");
    expect(leafText()).not.toContain("Content");
    expect(leafText()).not.toContain("Collections");
  });

  it("names five sections, without ordinals, over singular singleton labels and a Commands footer", async () => {
    await render("style-guide");
    expect(
      [...document.querySelectorAll(".studio-area-link span")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Home", "Library", "Publish", "Chat", "Brain"]);
    expect(
      [...document.querySelectorAll(".studio-area-link b")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["", "", "", "", ""]);
    expect(document.querySelector(".studio-navigation em")).toBeNull();
    expect(
      document.querySelector(".studio-navigation .command-chip")?.textContent,
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

  it("makes every listed destination a link the browser can open elsewhere", async () => {
    await render();
    await click(".studio-area-link", "Publish");
    const publishing = [
      ...document.querySelectorAll<HTMLAnchorElement>("a.studio-leaf-link"),
    ].find((link) => link.textContent.includes("Publishing"));
    expect(publishing?.getAttribute("href")).toBe(
      "/studio/workspaces/content-pipeline%3Apublishing",
    );
    // A modified click opens a tab; Studio does not navigate in place.
    await act(async () =>
      publishing?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      ),
    );
    expect(selected).toEqual([]);
    await click(".studio-area-link", "Library");
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>("a.studio-leaf-link")]
        .find((link) => link.textContent.includes("Notes"))
        ?.getAttribute("href"),
    ).toBe("/studio/entities/note");
  });

  it("browses Publish without opening Chat, fetching a destination or replacing the current document", async () => {
    await render();
    await click(".studio-area-link", "Publish");
    expect(selected).toEqual([]);
    expect(currentArea()).toContain("Publish");
    expect(leafText()).not.toContain("Chat");
    expect(leafText()).not.toContain("Account");
    expect(leafText()).toContain("Publishing");
    await render(); // A badge/data refresh must not undo intentional browsing.
    expect(currentArea()).toContain("Publish");
    await click(".studio-leaf-link", "Publishing");
    expect(selected).toEqual(["content-pipeline:publishing"]);
  });

  it("opens Chat directly, without a list under it or losing collapse", async () => {
    await render();
    await click(".studio-navigation-collapse", "⇤");
    await click(".studio-area-link", "Chat");
    expect(selected).toEqual(["web-chat:chat"]);
    await render(null, "web-chat:chat");
    expect(currentArea()).toContain("Chat");
    expect(document.querySelector(".studio-leaf-rail")).toBeNull();
    expect(
      document
        .querySelector(".studio-navigation")
        ?.getAttribute("data-leaf-open"),
    ).toBe("false");
    expect(window.localStorage.getItem("studio.navigation.collapsed")).toBe(
      "true",
    );
    await click(".studio-area-link", "Publish");
    expect(leafText()).toContain("Publishing");
    expect(window.localStorage.getItem("studio.navigation.collapsed")).toBe(
      "false",
    );
    await click(".studio-area-link", "Chat");
    expect(document.querySelector(".studio-leaf-rail")).toBeNull();
    expect(selected).toEqual(["web-chat:chat"]); // Same-page clicks do not reset session/tab queries.
  });

  it("opens Home at its page and lists Home's pages under it there", async () => {
    await render();
    await click(".studio-area-link", "Home");
    expect(selected).toEqual(["studio:overview"]);
    await render(null, "studio:overview");
    expect(currentArea()).toContain("Home");
    expect(leafText()).toContain("Inbox");
    expect(leafText()).not.toContain("Overview");
  });

  it("leaves Account outside every section, but still lets it browse destinations", async () => {
    await render(null, "studio:account");
    expect(
      studioArea(null, { id: "studio:account", section: "brain" }),
    ).toBeNull();
    expect(currentArea()).toBeUndefined();
    expect(document.querySelector(".studio-leaf-rail")).toBeNull();
    expect(
      document.querySelector(".studio-navigation")?.textContent,
    ).not.toContain("Account");
    await click(".studio-area-link", "Brain");
    expect(leafText()).toContain("Identity");
    expect(leafText()).toContain("Administration");
    expect(leafText()).not.toContain("Account");
  });

  it("does not show Chat or Publish unless the admitted workspace list has them", async () => {
    await render(
      "note",
      null,
      workspaces.filter(
        (workspace) =>
          !["web-chat:chat", "content-pipeline:publishing"].includes(
            workspace.id,
          ),
      ),
    );
    const labels = [...document.querySelectorAll(".studio-area-link")].map(
      (node) => node.getAttribute("aria-label"),
    );
    expect(labels).not.toContain("Chat");
    expect(labels).not.toContain("Publish");
  });

  it("carries admitted attention onto the section, including when folded", async () => {
    await render(
      "note",
      null,
      workspaces.map((workspace) =>
        workspace.id === "admin:administration"
          ? { ...workspace, badge: 2 }
          : workspace,
      ),
    );
    const brain = document.querySelector(
      '.studio-area-link[aria-label="Brain"]',
    );
    expect(brain?.querySelector("small")?.textContent).toBe("2");
    expect(brain?.getAttribute("aria-description")).toBe("2 need attention");
    await click(".studio-navigation-collapse", "⇤");
    expect(brain?.getAttribute("aria-description")).toBe("2 need attention");
  });

  it("does not change browsing when a guarded direct destination is rejected", async () => {
    await render();
    await click(".studio-area-link", "Brain");
    await click(".studio-area-link", "Chat");
    await render();
    expect(selected).toEqual(["web-chat:chat"]);
    expect(currentArea()).toContain("Brain");
    expect(leafText()).toContain("Identity");
  });

  it("restores the owning section when the route changes, including a return to a previous route", async () => {
    await render();
    await click(".studio-area-link", "Publish");
    await render("style-guide");
    expect(currentArea()).toContain("Brain");
    expect(leafText()).toContain("Identity");
    expect(leafText()).toContain("Intelligence");
    expect(leafText()).toContain("Network");
    await render();
    expect(currentArea()).toContain("Library");
  });

  it("keeps browsing intact when a destination change is blocked by an unsaved draft", async () => {
    await render();
    await click(".studio-area-link", "Brain");
    await click(".studio-leaf-link", "Style Guide");
    await render(); // The guarded router has not accepted the request.
    expect(currentArea()).toContain("Brain");
    expect(selected).toEqual(["style-guide"]);
    await click(".studio-area-link", "Library");
    expect(
      document.querySelector('.studio-leaf-link[aria-current="page"]')
        ?.textContent,
    ).toContain("Notes");
  });
});

it("lists the brain's images with the Library", async () => {
  const opened: string[] = [];
  const renderImages = async (active: boolean): Promise<void> =>
    act(async () =>
      root.render(
        <TypeSwitcher
          renderMode="desktop"
          types={types}
          active={active ? null : "note"}
          workspaces={workspaces}
          workspaceBadges={{}}
          activeWorkspace={null}
          images={{ active, onSelect: () => opened.push("images") }}
          onSelect={(id) => selected.push(id)}
          onSelectWorkspace={(id) => selected.push(id)}
        />,
      ),
    );
  await renderImages(false);
  const link = [
    ...document.querySelectorAll<HTMLAnchorElement>(".studio-leaf-rail a"),
  ].find((node) => node.textContent === "Images");
  expect(link?.getAttribute("href")).toBe("/studio/images");
  expect(leafText()).toContain("Media");
  await act(async () => link?.click());
  expect(opened).toEqual(["images"]);
  await renderImages(true);
  expect(
    document.querySelector('.studio-leaf-rail a[aria-current="page"]')
      ?.textContent,
  ).toBe("Images");
});

it("keeps Library's empty types under All types, and remembers the types opened", async () => {
  const withEmpty: EntityTypeInfo[] = [
    ...types,
    {
      entityType: "newsletter",
      classification: "content",
      label: "Newsletters",
      singularLabel: "Newsletter",
      isSingleton: false,
      hasBody: true,
      count: 0,
      hierarchy: studioTypeHierarchy("newsletter"),
      capabilities,
    },
  ];
  await act(async () =>
    root.render(
      <TypeSwitcher
        renderMode="desktop"
        types={withEmpty}
        active="note"
        workspaces={workspaces}
        workspaceBadges={{}}
        activeWorkspace={null}
        onSelect={(id) => selected.push(id)}
        onSelectWorkspace={(id) => selected.push(id)}
      />,
    ),
  );
  const allTypes = document.querySelector<HTMLDetailsElement>(
    ".studio-leaf-rail details",
  );
  expect(allTypes?.querySelector("summary")?.textContent).toBe("All types");
  expect(allTypes?.open).toBe(false);
  expect(allTypes?.textContent).toContain("Newsletters");
  expect(
    [...document.querySelectorAll(".studio-leaf-rail a")]
      .filter((link) => !allTypes?.contains(link))
      .map((link) => link.textContent),
  ).not.toContain("Newsletters");
  expect(
    JSON.parse(window.localStorage.getItem("studio.recent-types") ?? "[]"),
  ).toEqual(["note"]);
});

it("lists Chat's other pages under Chat while you are in it", async () => {
  await render(null, "web-chat:chat", [
    ...workspaces,
    {
      id: "web-chat:guest-chat",
      section: "chat",
      pluginId: "web-chat",
      label: "Guest chat",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 80,
      permission: "admin",
      entityTypes: [],
    },
  ]);
  expect(
    document.querySelector('.studio-leaf-rail[aria-label="Chat destinations"]')
      ?.textContent,
  ).toContain("Guest chat");
});
