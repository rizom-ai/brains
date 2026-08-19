/** @jsxImportSource react */
import type {
  RuntimeCmsWorkspaceData,
  RuntimeOperatorActionControl,
} from "@brains/plugins";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { DeclarativeWorkspace } from "./declarative-workspace";

const data: RuntimeCmsWorkspaceData = {
  view: {
    title: "Reading library",
    blocks: [
      {
        type: "stats",
        items: [{ label: "Saved", value: 1, tone: "good" }],
      },
      {
        type: "notice",
        tone: "warn",
        text: "Review <script>alert('unsafe')</script>",
      },
      {
        type: "text",
        id: "original-content",
        label: "Original content",
        text: "First line\n<script>alert('still unsafe')</script>",
        truncated: true,
      },
      {
        type: "group",
        id: "automation",
        label: "Automation",
        items: [{ id: "watcher", label: "Watcher", value: true }],
      },
      {
        type: "flow",
        id: "pipeline",
        label: "Content flow",
        direction: "bidirectional",
        steps: [
          { id: "files", label: "Files", status: "complete" },
          { id: "store", label: "Store", status: "active" },
        ],
      },
      {
        type: "meters",
        id: "health",
        items: [{ id: "routes", label: "Routes", value: 4, max: 10 }],
      },
      {
        type: "progress",
        id: "build",
        label: "Preview build",
        state: "building",
        progress: 0.5,
      },
      {
        type: "query",
        id: "library-query",
        controls: [
          {
            key: "source",
            label: "Source",
            value: "mail",
            allLabel: "All sources",
            options: [{ value: "mail", label: "Mail", count: 1 }],
          },
        ],
        pagination: { offset: 0, limit: 1, total: 2 },
      },
      {
        type: "links",
        items: [
          {
            label: "Open publishing",
            target: {
              kind: "launch",
              launch: { target: "publishing" },
            },
          },
        ],
      },
      {
        type: "table",
        id: "saved",
        empty: "Nothing saved.",
        columns: [
          { key: "title", label: "Title" },
          { key: "tags", label: "Tags" },
        ],
        rows: [
          {
            id: "saved-1",
            cells: { title: "Saved item", tags: ["one", "two"] },
            actions: [
              {
                actionId: "refresh",
                label: "Refresh",
                input: { id: "saved-1" },
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("DeclarativeWorkspace", () => {
  it("renders normalized base blocks and typed action controls", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data,
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: { source: "mail", offset: 0, limit: 1 },
        onQueryChange: () => {},
      }),
    );

    expect(html).toContain("Reading library");
    expect(html).toContain("Saved item");
    expect(html).toContain("one, two");
    expect(html).toContain("Refresh");
    expect(html).toContain("Review &lt;script&gt;");
    expect(html).toContain("Original content");
    expect(html).toContain("First line\n&lt;script&gt;");
    expect(html).toContain("Source content was truncated by its provider.");
    expect(html).toContain("Automation");
    expect(html).toContain('data-direction="bidirectional"');
    expect(html).toContain('data-status="active"');
    expect(html).toContain('<progress value="4" max="10">');
    expect(html).toContain("Preview build");
    expect(html).toContain("All sources");
    expect(html).toContain("Mail (1)");
    expect(html).toContain("1–1 of 2");
    expect(html).toContain("Next");
    expect(html).toContain(
      '<button type="button" class="declarative-inline-link">Open publishing</button>',
    );
    expect(html).not.toContain("<script>");
  });

  it("promotes leading totals into the workspace head instead of a body card", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data,
        onAction: async () => ({}),
        onOpenEntity: () => {},
      }),
    );

    const head = html.slice(
      html.indexOf('class="declarative-head"'),
      html.indexOf('class="declarative-blocks"'),
    );
    expect(head).toContain("Reading library");
    expect(head).toContain("declarative-totals");
    expect(head).toContain("Saved");
    // The hoisted stats must not also render as a body block.
    expect(
      html.slice(html.indexOf('class="declarative-blocks"')),
    ).not.toContain("declarative-totals");
  });

  it("declares a layout span per block so the host grid can differentiate width", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data,
        onAction: async () => ({}),
        onOpenEntity: () => {},
      }),
    );

    expect(html).toContain('data-block="table" data-span="wide"');
    expect(html).toContain('data-block="group" data-span="compact"');
    expect(html).toContain('data-block="meters" data-span="compact"');
    expect(html).toContain('data-block="progress" data-span="compact"');
    expect(html).toContain('data-block="notice" data-span="wide"');
  });

  it("ranks action buttons by consequence rather than styling them all alike", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data: {
          view: {
            title: "Directory sync",
            blocks: [
              {
                type: "actions",
                id: "sync-actions",
                items: [
                  { actionId: "sync", label: "Run sync now", input: {} },
                  {
                    actionId: "purge",
                    label: "Purge exports",
                    input: {},
                    confirmation: { kind: "prepared" },
                  },
                ],
              },
              {
                type: "list",
                id: "runs",
                empty: "No runs.",
                items: [
                  {
                    id: "run-1",
                    title: "Morning run",
                    actions: [
                      { actionId: "open", label: "Open", input: { id: "1" } },
                    ],
                  },
                ],
              },
            ],
          },
        },
        onAction: async () => ({}),
        onOpenEntity: () => {},
      }),
    );

    // A standalone action is the workspace's primary call to action.
    expect(html).toContain('class="btn">Run sync now');
    // Needing confirmation is the signal that an action is consequential.
    expect(html).toContain('class="btn danger">Purge exports');
    // Row-level actions stay subordinate to the row they belong to.
    expect(html).toContain('class="btn ghost">Open');
  });
});

function confirmingWorkspace(
  confirmation: RuntimeOperatorActionControl["confirmation"],
): RuntimeCmsWorkspaceData {
  return {
    view: {
      title: "Directory sync",
      blocks: [
        {
          type: "actions",
          id: "sync-actions",
          items: [
            {
              actionId: "purge",
              label: "Purge exports",
              input: { scope: "all" },
              ...(confirmation ? { confirmation } : {}),
            },
          ],
        },
      ],
    },
  };
}

describe("DeclarativeWorkspace confirmations", () => {
  let windowInstance: Window;
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    windowInstance = new Window({
      url: "https://brain.test/cms/workspaces/directory-sync",
    });
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      navigator: windowInstance.navigator,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      Event: windowInstance.Event,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    // globalThis.document is the happy-dom document assigned above, but typed
    // as lib.dom's — so the element it makes is the one createRoot declares,
    // and the object at runtime is still happy-dom's.
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    windowInstance.close();
  });

  const clickButton = async (label: string): Promise<void> => {
    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((candidate) => String(candidate.textContent).trim() === label);
    if (!button) throw new Error(`Expected a "${label}" button`);
    await act(async () => button.click());
  };

  it("confirms static actions in the CMS dialog rather than a browser prompt", async () => {
    const invocations: RuntimeOperatorActionControl[] = [];
    await act(async () => {
      root.render(
        createElement(DeclarativeWorkspace, {
          data: confirmingWorkspace({
            kind: "static",
            message: "Purge every exported file?",
          }),
          onAction: async (action) => {
            invocations.push(action);
            return {};
          },
          onOpenEntity: () => {},
        }),
      );
    });

    await clickButton("Purge exports");

    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Purge every exported file?");
    expect(invocations).toHaveLength(0);

    await clickButton("Cancel");
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(invocations).toHaveLength(0);

    await clickButton("Purge exports");
    await clickButton("Confirm action");
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.actionId).toBe("purge");
  });

  it("shows a prepared summary in the dialog and executes with its token", async () => {
    const invocations: RuntimeOperatorActionControl[] = [];
    await act(async () => {
      root.render(
        createElement(DeclarativeWorkspace, {
          data: confirmingWorkspace({ kind: "prepared" }),
          onAction: async (action) => {
            invocations.push(action);
            return action.invocation?.mode === "prepare"
              ? {
                  kind: "prepared-confirmation",
                  token: "proof-1",
                  summary: "Removes 12 exported files.",
                  expiresAt: "2026-08-18T10:00:00.000Z",
                }
              : {};
          },
          onOpenEntity: () => {},
        }),
      );
    });

    await clickButton("Purge exports");

    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.invocation?.mode).toBe("prepare");
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain("Removes 12 exported files.");

    await clickButton("Confirm action");
    expect(invocations).toHaveLength(2);
    expect(invocations[1]?.invocation).toEqual({
      mode: "execute",
      token: "proof-1",
    });
  });
});

const detailData = (open?: {
  forId: string;
  title: string;
}): RuntimeCmsWorkspaceData => ({
  view: {
    title: "Inbox",
    blocks: [
      {
        type: "detail",
        id: "inbox",
        queryKey: "selected",
        empty: "Select an item to read it.",
        master: {
          type: "list",
          id: "inbox-items",
          empty: "Nothing needs attention.",
          items: [
            {
              id: "mail-1",
              title: "Collaboration request",
              link: { kind: "detail", itemId: "mail-1" },
            },
            { id: "mail-2", title: "Invoice awaiting approval" },
          ],
        },
        ...(open
          ? {
              open: {
                ...open,
                blocks: [
                  {
                    type: "text",
                    id: "original",
                    text: "The original message body.",
                  },
                ],
              },
            }
          : {}),
      },
    ],
  },
});

describe("DeclarativeWorkspace master/detail", () => {
  let windowInstance: Window;
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    windowInstance = new Window({ url: "https://brain.test/cms" });
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      navigator: windowInstance.navigator,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      Event: windowInstance.Event,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    windowInstance.close();
  });

  it("renders the collection beside the open item and marks the open row", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data: detailData({ forId: "mail-1", title: "Collaboration request" }),
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: { selected: "mail-1" },
      }),
    );

    expect(html).toContain("declarative-detail-master");
    expect(html).toContain("declarative-detail-pane");
    expect(html).toContain('data-open="true"');
    expect(html).toContain("The original message body.");
    // The open row is marked from the detail's forId, not a per-item flag.
    expect(html).toContain('aria-current="true"');
    expect(html).not.toContain("Select an item to read it.");
  });

  it("opens a row through canonical query state rather than a navigation", async () => {
    const queries: unknown[] = [];
    await act(async () => {
      root.render(
        createElement(DeclarativeWorkspace, {
          data: detailData(),
          onAction: async () => ({}),
          onOpenEntity: () => {},
          query: { urgency: "high", offset: 20 },
          onQueryChange: (query) => queries.push(query),
        }),
      );
    });

    const open = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (candidate) =>
        String(candidate.textContent).trim() === "Collaboration request",
    );
    if (!open) throw new Error("Expected an openable master row");
    await act(async () => open.click());

    expect(queries).toEqual([
      { urgency: "high", offset: 0, selected: "mail-1" },
    ]);
  });

  it("clears the open item from query state through the back control", async () => {
    const queries: unknown[] = [];
    await act(async () => {
      root.render(
        createElement(DeclarativeWorkspace, {
          data: detailData({ forId: "mail-1", title: "Collaboration request" }),
          onAction: async () => ({}),
          onOpenEntity: () => {},
          query: { urgency: "high", selected: "mail-1" },
          onQueryChange: (query) => queries.push(query),
        }),
      );
    });

    const back = container.querySelector<HTMLButtonElement>(
      ".declarative-detail-back",
    );
    if (!back) throw new Error("Expected a back control");
    await act(async () => back.click());

    expect(queries).toEqual([{ urgency: "high" }]);
  });
});

describe("DeclarativeWorkspace detail pending state", () => {
  it("marks the requested row and shows the pane before its content arrives", () => {
    // Query asks for a row the view has not returned yet: the load is in
    // flight, which must read differently from nothing being open.
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data: detailData(),
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: { selected: "mail-1" },
        onQueryChange: () => {},
      }),
    );

    expect(html).toContain('data-open="true"');
    expect(html).toContain('aria-current="true"');
    // A slow source must read as loading, never as nothing having happened.
    expect(html).toContain("Loading…");
  });

  it("gives the collection the full measure when nothing is requested", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data: detailData(),
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: {},
        onQueryChange: () => {},
      }),
    );

    expect(html).toContain('data-open="false"');
    expect(html).not.toContain("declarative-detail-pane");
    expect(html).not.toContain('aria-current="true"');
  });
});

describe("DeclarativeWorkspace head", () => {
  it("renders the eyebrow, description and status beside the title", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data: {
          view: {
            kicker: "Durability operations",
            title: "Content sync",
            description: "Keep the entity database and Git remote converged.",
            status: {
              label: "Healthy",
              detail: "last settled 4m ago",
              tone: "good",
            },
            blocks: [],
          },
        },
        onAction: async () => ({}),
        onOpenEntity: () => {},
      }),
    );

    expect(html).toContain("Durability operations");
    expect(html).toContain("Content sync");
    expect(html).toContain(
      "Keep the entity database and Git remote converged.",
    );
    expect(html).toContain("Healthy");
    expect(html).toContain("last settled 4m ago");
    expect(html).toContain('data-tone="good"');
  });
});

describe("DeclarativeWorkspace pagination", () => {
  const paged = (offset: number): RuntimeCmsWorkspaceData => ({
    view: {
      title: "Inbox",
      blocks: [
        {
          type: "query",
          id: "q",
          controls: [],
          pagination: { offset, limit: 10, total: 24 },
        },
      ],
    },
  });

  it("states the window and offers both directions", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data: paged(10),
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: { offset: 10, limit: 10 },
        onQueryChange: () => {},
      }),
    );

    // The control replaces the page, so it must say where it is and let the
    // operator go back — "Load more" promised an append it never did.
    expect(html).toContain("11–20 of 24");
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
  });

  it("disables the direction it cannot go", () => {
    const first = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data: paged(0),
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: { offset: 0, limit: 10 },
        onQueryChange: () => {},
      }),
    );
    expect(first).toContain("1–10 of 24");
    expect(first).toMatch(/Previous<\/button>/);
    expect(first).toContain('disabled=""');
  });
});
