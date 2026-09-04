/** @jsxImportSource react */
import type {
  RuntimeStudioWorkspaceData,
  RuntimeOperatorActionControl,
} from "@brains/plugins";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import operatorViewRendererStyles from "./operator-view-renderer.css" with { type: "text" };
import {
  OperatorViewRenderer,
  actionFailureMessage,
} from "./operator-view-renderer";

const data: RuntimeStudioWorkspaceData = {
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

describe("actionFailureMessage", () => {
  it("carries the reason the action gave", () => {
    expect(actionFailureMessage(new Error("upstream refused"))).toBe(
      "Action failed: upstream refused",
    );
  });

  it("falls back when there is no reason to show", () => {
    expect(actionFailureMessage(new Error("   "))).toBe("Action failed.");
    expect(actionFailureMessage("a bare string")).toBe("Action failed.");
    expect(actionFailureMessage(undefined)).toBe("Action failed.");
  });
});

describe("OperatorViewRenderer", () => {
  it("renders normalized base blocks and typed action controls", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
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
      createElement(OperatorViewRenderer, {
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

  it("keeps server-backed query controls with their table collection", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
        data: {
          view: {
            title: "Audit",
            blocks: [
              {
                type: "table",
                id: "events",
                empty: "No events.",
                query: {
                  controls: [
                    {
                      key: "actor",
                      label: "Actor",
                      allLabel: "All actors",
                      options: [{ value: "mira", label: "Mira" }],
                    },
                  ],
                  pagination: { offset: 0, limit: 25, total: 1 },
                },
                columns: [{ key: "event", label: "Event" }],
                rows: [{ id: "event-1", cells: { event: "Signed in" } }],
              },
            ],
          },
        },
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: {},
        onQueryChange: () => {},
      }),
    );

    expect(html).toContain('class="declarative-table-collection"');
    expect(html).toContain("All actors");
    expect(html).toContain("1–1 of 1");
    expect(html.indexOf("All actors")).toBeLessThan(html.indexOf("Signed in"));
  });

  it("reflows only source-annotated table rows into the compact list grammar", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
        data: {
          view: {
            title: "People",
            blocks: [
              {
                type: "table",
                id: "people",
                empty: "No people.",
                columns: [
                  { key: "person", label: "Person" },
                  { key: "role", label: "Role" },
                ],
                rows: [
                  {
                    id: "mira",
                    cells: { person: "Mira Reyes", role: "Admin" },
                    compact: {
                      title: "Mira Reyes",
                      description: "Owns this brain",
                      metadata: ["Admin", "This brain"],
                      badges: [{ label: "Active", tone: "good" }],
                      count: 3,
                      tone: "neutral",
                    },
                    link: { kind: "detail", itemId: "mira" },
                    actions: [
                      {
                        actionId: "review-person",
                        label: "Review",
                        input: { userId: "mira" },
                      },
                    ],
                  },
                  {
                    id: "legacy",
                    cells: { person: "Legacy row", role: "Trusted" },
                  },
                ],
              },
            ],
          },
        },
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: {},
        onQueryChange: () => {},
      }),
    );

    expect(html).toContain('class="declarative-compact-rows"');
    expect(html).toContain('data-compact-row="true"');
    expect(html).toContain('data-has-unannotated="true"');
    expect(html).toContain("Owns this brain");
    expect(html).toContain("Admin · This brain");
    expect(html).toContain('class="declarative-badge" data-tone="good"');
    expect(html).toContain("Legacy row");
    expect(html.match(/Review/g)).toHaveLength(2);
    expect(operatorViewRendererStyles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.declarative-compact-rows/,
    );
    expect(operatorViewRendererStyles).toContain(
      '.declarative-table-scroll[data-has-unannotated="false"]',
    );
    expect(operatorViewRendererStyles).toContain(
      ".declarative-list-trailing:has(.declarative-actions)",
    );
  });

  it("can delegate the head without returning its totals to the body", () => {
    const delegated = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
        data: {
          view: {
            title: "Reading library",
            primaryAction: {
              actionId: "refresh",
              label: "Refresh library",
              input: {},
            },
            blocks: [
              { type: "stats", items: [{ label: "Saved", value: 1 }] },
              { type: "notice", tone: "neutral", text: "Ready." },
            ],
          },
        },
        renderHead: false,
        onAction: async () => ({}),
        onOpenEntity: () => {},
      }),
    );
    const selfRendered = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
        data: {
          view: {
            title: "Reading library",
            primaryAction: {
              actionId: "refresh",
              label: "Refresh library",
              input: {},
            },
            blocks: [],
          },
        },
        onAction: async () => ({}),
        onOpenEntity: () => {},
      }),
    );

    expect(delegated).not.toContain("declarative-head");
    expect(delegated).not.toContain("Saved");
    expect(delegated).toContain("Ready.");
    expect(selfRendered).toContain("Refresh library");
  });

  it("declares a layout span per block so the host grid can differentiate width", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
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
      createElement(OperatorViewRenderer, {
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
    expect(html).toMatch(/class="btn"[^>]*>Run sync now/);
    // Needing confirmation is the signal that an action is consequential.
    expect(html).toMatch(/class="btn danger"[^>]*>Purge exports/);
    // Row-level actions stay subordinate to the row they belong to.
    expect(html).toMatch(/class="btn ghost"[^>]*>Open/);
  });
});

function confirmingWorkspace(
  confirmation: RuntimeOperatorActionControl["confirmation"],
): RuntimeStudioWorkspaceData {
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

describe("OperatorViewRenderer conformance", () => {
  it("renders every container and remaining panel shape through the shared host", () => {
    const conformance: RuntimeStudioWorkspaceData = {
      view: {
        blocks: [
          {
            type: "key-values",
            items: [{ label: "Mode", value: "shared" }],
          },
          {
            type: "matrix",
            id: "matrix",
            columns: 2,
            cells: [
              {
                id: "cell",
                label: "Cell",
                items: [],
                empty: "Empty cell",
              },
            ],
          },
          {
            type: "spatial",
            layout: "cartesian",
            id: "space",
            label: "Semantic space",
            description: "One point",
            points: [
              {
                id: "point",
                label: "Point",
                category: "topic",
                x: 0.5,
                y: 0.5,
              },
            ],
            zones: [],
            relationships: [],
            legend: [{ label: "Topic" }],
          },
          {
            type: "tabs",
            id: "tabs",
            label: "Views",
            defaultTab: "first",
            tabs: [
              {
                id: "first",
                label: "First",
                blocks: [{ type: "notice", text: "First panel" }],
              },
            ],
          },
          {
            type: "columns",
            id: "columns",
            primary: [
              {
                type: "card",
                id: "primary-card",
                label: "Primary",
                blocks: [{ type: "notice", text: "Primary fact" }],
              },
            ],
            aside: [
              {
                type: "card",
                id: "aside-card",
                label: "Aside",
                blocks: [
                  {
                    type: "key-values",
                    items: [{ label: "State", value: "ready" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
        data: conformance,
        onAction: async () => undefined,
        onOpenEntity: () => {},
      }),
    );

    for (const marker of [
      "declarative-key-values",
      "declarative-matrix",
      "data-ui-spatial",
      "declarative-tabs",
      "declarative-columns",
      "declarative-card",
    ]) {
      expect(html).toContain(marker);
    }
  });

  it("selects a full workspace tab from query state", () => {
    const tabbed: RuntimeStudioWorkspaceData = {
      view: {
        blocks: [
          {
            type: "tabs",
            id: "administration-tabs",
            label: "Administration sections",
            defaultTab: "people",
            queryKey: "tab",
            tabs: [
              {
                id: "people",
                label: "People",
                blocks: [{ type: "text", text: "People roster" }],
              },
              {
                id: "audit",
                label: "Audit",
                blocks: [
                  {
                    type: "detail",
                    id: "audit-detail",
                    queryKey: "selected",
                    empty: "Select an event.",
                    master: {
                      type: "table",
                      id: "audit-events",
                      empty: "No events.",
                      columns: [{ key: "event", label: "Event" }],
                      rows: [],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
        data: tabbed,
        onAction: async () => undefined,
        onOpenEntity: () => {},
        query: { tab: "audit" },
        onQueryChange: () => {},
      }),
    );

    expect(html).toContain("Audit");
    expect(html).toContain("No events.");
    expect(html).not.toContain("People roster");
  });
});

describe("OperatorViewRenderer confirmations", () => {
  let windowInstance: Window;
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    windowInstance = new Window({
      url: "https://brain.test/studio/workspaces/directory-sync",
    });
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      navigator: windowInstance.navigator,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      Event: windowInstance.Event,
      FormData: windowInstance.FormData,
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

  it("confirms static actions in the Studio dialog rather than a browser prompt", async () => {
    const invocations: RuntimeOperatorActionControl[] = [];
    await act(async () => {
      root.render(
        createElement(OperatorViewRenderer, {
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

  it("keeps disclosure forms collapsed until summoned and follows the selected field label", async () => {
    const action: RuntimeOperatorActionControl = {
      actionId: "invite",
      label: "Add a person",
      input: { idempotencyKey: "request-1" },
      form: {
        presentation: "disclosure",
        submitLabel: "Create invitation",
        fields: [
          {
            name: "deliveryType",
            label: "Delivery channel",
            control: "select",
            required: true,
            options: [
              { value: "email", label: "Email" },
              { value: "discord", label: "Discord" },
            ],
          },
          {
            name: "deliverySubject",
            label: "Delivery destination",
            labelBy: {
              field: "deliveryType",
              values: [
                { value: "email", label: "Email address" },
                { value: "discord", label: "Discord user ID" },
              ],
            },
            control: "text",
            required: true,
          },
        ],
      },
    };
    await act(async () => {
      root.render(
        createElement(OperatorViewRenderer, {
          data: { view: { blocks: [{ type: "action", ...action }] } },
          onAction: async () => undefined,
          onOpenEntity: () => {},
        }),
      );
    });

    const disclosure = container.querySelector<HTMLDetailsElement>(
      ".declarative-action-disclosure",
    );
    if (!disclosure) throw new Error("Expected action disclosure");
    expect(disclosure.open).toBe(false);
    expect(disclosure.textContent).toContain("Email address");

    const channel = disclosure.querySelector<HTMLSelectElement>(
      'select[name="deliveryType"]',
    );
    if (!channel) throw new Error("Expected delivery channel control");
    await act(async () => {
      disclosure.open = true;
      channel.value = "discord";
      channel.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(disclosure.open).toBe(true);
    expect(disclosure.textContent).toContain("Discord user ID");
  });

  it("submits typed form input and presents bounded action results", async () => {
    const invocations: RuntimeOperatorActionControl[] = [];
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string): Promise<void> => {
          copied = value;
        },
      },
    });
    const action: RuntimeOperatorActionControl = {
      actionId: "invite",
      label: "Invite person",
      input: { idempotencyKey: "request-1" },
      form: {
        submitLabel: "Create invitation",
        fields: [
          {
            name: "displayName",
            label: "Display name",
            control: "text",
            required: true,
          },
          {
            name: "deliveryToken",
            label: "Delivery token",
            control: "text",
            required: true,
            secret: true,
          },
          {
            name: "role",
            label: "Role",
            control: "select",
            required: true,
            options: [
              { value: "trusted", label: "Trusted" },
              { value: "admin", label: "Admin" },
            ],
          },
        ],
      },
      result: {
        title: "Invitation setup",
        fields: [
          { name: "status", label: "Status" },
          {
            name: "setupUrl",
            label: "Single-use setup URL",
            copyable: true,
            sensitive: true,
          },
        ],
      },
    };
    const workspaceData: RuntimeStudioWorkspaceData = {
      view: { blocks: [{ type: "action", ...action }] },
    };
    await act(async () => {
      root.render(
        createElement(OperatorViewRenderer, {
          data: workspaceData,
          onAction: async (invocation) => {
            invocations.push(invocation);
            return {
              status: "Manual delivery pending",
              setupUrl: "https://brain.test/auth/setup/token-1",
              ignored: "not declared",
            };
          },
          onOpenEntity: () => {},
        }),
      );
    });

    const displayName = container.querySelector<HTMLInputElement>(
      'input[name="displayName"]',
    );
    const deliveryToken = container.querySelector<HTMLInputElement>(
      'input[name="deliveryToken"]',
    );
    const role = container.querySelector<HTMLSelectElement>(
      'select[name="role"]',
    );
    if (!displayName || !deliveryToken || !role) {
      throw new Error("Expected invitation form");
    }
    expect(deliveryToken.type).toBe("password");
    expect(deliveryToken.value).toBe("");
    displayName.value = "Ada Lovelace";
    deliveryToken.value = "private-token";
    role.value = "admin";
    await clickButton("Create invitation");

    expect(deliveryToken.value).toBe("");
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.input).toEqual({
      idempotencyKey: "request-1",
      displayName: "Ada Lovelace",
      deliveryToken: "private-token",
      role: "admin",
    });
    const result = container.querySelector(".declarative-action-result");
    expect(result?.textContent).toContain("Manual delivery pending");
    expect(result?.textContent).toContain(
      "https://brain.test/auth/setup/token-1",
    );
    expect(result?.textContent).not.toContain("not declared");
    expect(result?.querySelector("[data-sensitive]")).not.toBeNull();
    await clickButton("Copy");
    expect(copied).toBe("https://brain.test/auth/setup/token-1");

    await act(async () => {
      root.render(
        createElement(OperatorViewRenderer, {
          data: {
            view: {
              blocks: [
                {
                  type: "action",
                  ...action,
                  input: { idempotencyKey: "request-2" },
                },
              ],
            },
          },
          onAction: async () => ({}),
          onOpenEntity: () => {},
        }),
      );
    });
    expect(container.querySelector(".declarative-action-result")).toBeNull();
  });

  it("shows a prepared summary in the dialog and executes with its token", async () => {
    const invocations: RuntimeOperatorActionControl[] = [];
    await act(async () => {
      root.render(
        createElement(OperatorViewRenderer, {
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
}): RuntimeStudioWorkspaceData => ({
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

describe("OperatorViewRenderer master/detail", () => {
  let windowInstance: Window;
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    windowInstance = new Window({ url: "https://brain.test/studio" });
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
      createElement(OperatorViewRenderer, {
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
        createElement(OperatorViewRenderer, {
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
      { urgency: "high", offset: 20, selected: "mail-1" },
    ]);
  });

  it("writes query-backed tab selection through host state", async () => {
    const queries: unknown[] = [];
    const tabbed: RuntimeStudioWorkspaceData = {
      view: {
        blocks: [
          {
            type: "tabs",
            id: "administration-tabs",
            label: "Administration sections",
            defaultTab: "people",
            queryKey: "tab",
            tabs: [
              {
                id: "people",
                label: "People",
                blocks: [{ type: "text", text: "People roster" }],
              },
              {
                id: "audit",
                label: "Audit",
                blocks: [{ type: "text", text: "Audit history" }],
              },
            ],
          },
        ],
      },
    };
    await act(async () => {
      root.render(
        createElement(OperatorViewRenderer, {
          data: tabbed,
          onAction: async () => undefined,
          onOpenEntity: () => {},
          query: {
            selected: "audit-event-1",
            offset: 25,
            action: "auth.user.updated",
          },
          onQueryChange: (query) => queries.push(query),
        }),
      );
    });

    const auditTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ).find((candidate) => String(candidate.textContent).trim() === "Audit");
    if (!auditTab) throw new Error("Expected Audit tab");
    await act(async () => auditTab.click());

    expect(queries).toEqual([{ tab: "audit" }]);
  });

  it("clears the open item from query state through the back control", async () => {
    const queries: unknown[] = [];
    await act(async () => {
      root.render(
        createElement(OperatorViewRenderer, {
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

describe("OperatorViewRenderer detail pending state", () => {
  it("marks the requested row and shows the pane before its content arrives", () => {
    // Query asks for a row the view has not returned yet: the load is in
    // flight, which must read differently from nothing being open.
    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
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
      createElement(OperatorViewRenderer, {
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

describe("OperatorViewRenderer head", () => {
  it("renders the eyebrow, description and status beside the title", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
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

describe("OperatorViewRenderer pagination", () => {
  const paged = (offset: number): RuntimeStudioWorkspaceData => ({
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
      createElement(OperatorViewRenderer, {
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
      createElement(OperatorViewRenderer, {
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

describe("sidebar card readouts", () => {
  // A card in the aside column is roughly 220px of content box. Every block a
  // widget may put there has to survive that measure, because a source like
  // site-builder's Site health emits free-form build detail, not the one-word
  // states the rest of the fixture uses.

  it("lets a long key-value wrap instead of holding it on one line", () => {
    // white-space: nowrap here pushed a 90-character build detail straight out
    // of the card and off the document.
    expect(operatorViewRendererStyles).not.toMatch(
      /\.declarative-key-values dd,[\s\S]*?\.declarative-group dd \{[^}]*white-space: nowrap/,
    );
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-key-values dd,[\s\S]*?\.declarative-group dd \{[^}]*overflow-wrap: anywhere/,
    );
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-key-values > div \{[^}]*flex-wrap: wrap/,
    );
  });

  it("sizes stats to the card rather than breaking a state mid-word", () => {
    // The body grid's 128px minimum track needs 257px for two stats, which a
    // 220px card cannot give without opening up.
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-card \.declarative-stats \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(0, 1fr\)\)/,
    );
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-card \.declarative-stats dd \{[^}]*font-size: 17px/,
    );
  });

  it("keeps the line breaks a notice authored", () => {
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-notice p \{[^}]*white-space: pre-line/,
    );
  });

  it("renders one failure per line in a joined notice", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorViewRenderer, {
        data: {
          view: {
            title: "Site health",
            blocks: [
              {
                type: "notice",
                id: "build-failures",
                title: "Previous build failures",
                tone: "error",
                text: "production · job-7f21c: Route failed.\npreview · job-7f20a: Timed out.",
              },
            ],
          },
        },
        onAction: async () => ({}),
        onOpenEntity: () => {},
      }),
    );
    // The separator has to reach the DOM for pre-line to have anything to keep.
    expect(html).toContain("job-7f21c");
    expect(html).toContain("job-7f20a");
    expect(html).toMatch(/Route failed\.\s*\n\s*preview/);
  });
});

describe("author-supplied text cannot break the page", () => {
  // The protocol lets a source spend 500 characters on a list title, 4,000 on a
  // description, and 160 on each tag or badge. This renderer decides width from
  // the block's meaning, so none of those may reach past their column.

  it("breaks unbroken tokens in list text", () => {
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-list strong,[\s\S]*?\.declarative-list small \{[^}]*overflow-wrap: anywhere/,
    );
  });

  it("lets a long pill wrap inside its own measure", () => {
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-tags > span,[\s\S]*?\.declarative-badge \{[^}]*max-width: 100%/,
    );
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-tags > span,[\s\S]*?\.declarative-badge \{[^}]*overflow-wrap: anywhere/,
    );
    // nowrap here turned a 160-character badge into a page-width overrun.
    expect(operatorViewRendererStyles).not.toMatch(
      /\.declarative-tags > span,[\s\S]*?\.declarative-badge \{[^}]*white-space: nowrap/,
    );
  });

  it("keeps trailing row metadata inside the row", () => {
    expect(operatorViewRendererStyles).toMatch(
      /\.declarative-list-trailing > span:not\(\.declarative-badge\) \{[^}]*overflow-wrap: anywhere/,
    );
  });
});

describe("every author-text surface has a break guard", () => {
  // Kept as one list so a new text-bearing block cannot quietly ship without
  // deciding what happens to a string that has nowhere to break.
  const guarded = [
    ".declarative-spatial li strong",
    ".declarative-spatial li span",
    ".declarative-flow strong",
    ".declarative-progress strong",
    ".declarative-progress p",
    ".declarative-meters dd",
    ".declarative-links a",
    ".declarative-inline-link",
  ];

  // Read the one rule that owns this contract rather than searching the whole
  // sheet: a lazy match across blocks would happily find some other
  // overflow-wrap and pass without the selector being guarded at all.
  const contract =
    /---- author text[\s\S]*?\n([^{]*)\{([^}]*)\}/.exec(
      operatorViewRendererStyles,
    ) ?? undefined;

  it("declares the contract as a single rule", () => {
    expect(contract).toBeDefined();
    expect(contract?.[2]).toContain("overflow-wrap: anywhere");
  });

  for (const selector of guarded) {
    it(`breaks unbroken tokens in ${selector}`, () => {
      expect(contract?.[1]).toContain(selector);
    });
  }
});
