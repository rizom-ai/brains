import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import type { InboxWorkspaceSnapshot } from "./api";
import { InboxContact, UnifiedInboxWorkspace } from "./unified-inbox-workspace";

const data: InboxWorkspaceSnapshot = {
  summary: { open: 61, high: 1 },
  sources: [
    {
      source: { sourceId: "mail-items", displayName: "Email Triage" },
      open: 60,
      high: 1,
      available: true,
    },
    {
      source: { sourceId: "agent-candidates", displayName: "Candidates" },
      open: 0,
      high: 0,
      available: false,
    },
  ],
  entries: [
    {
      source: { sourceId: "mail-items", displayName: "Email Triage" },
      item: {
        id: "mail-1",
        title: "Time-sensitive collaboration request",
        summary: "A content-safe summary.",
        contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
        threadOrdinal: 2,
        receivedAt: "2026-08-08T09:00:00.000Z",
        urgency: "high",
        entityRef: { entityType: "mail-item", entityId: "mail-1" },
        actions: [{ id: "archive", label: "Archive", confirm: true }],
      },
      contactHref: "/access?person=prsn_sam",
      followUps: [
        {
          kind: "discuss-in-chat",
          label: "Discuss in chat",
          href: "/chat",
          state: {
            webChatPrefill: { version: 1, text: "About inbox item" },
          },
        },
        {
          kind: "open-entity",
          label: "Open source entity",
          href: "/cms/entities/mail-item/mail-1",
        },
      ],
    },
  ],
  errors: [
    {
      source: { sourceId: "agent-candidates", displayName: "Candidates" },
      error: "Source unavailable",
    },
  ],
  total: 60,
  offset: 0,
  limit: 50,
};

describe("UnifiedInboxWorkspace", () => {
  it("renders the bounded list, server filters, source status, and paging control", () => {
    const html = renderToStaticMarkup(
      createElement(UnifiedInboxWorkspace, {
        data,
        query: { sourceId: "mail-items", offset: 0, limit: 50 },
        onQueryChange: () => {},
        onFollowUp: () => {},
        onAction: async () => ({ kind: "completed" as const }),
      }),
    );

    expect(html).toContain("Live source-owned attention");
    expect(html).toContain("Time-sensitive collaboration request");
    expect(html).toContain("Sam Rivera · acme.io");
    expect(html).toContain("message 2 in thread");
    expect(html).not.toContain("message 2 of");
    expect(html).toContain('class="inbox-contact"');
    expect(html).toContain("Email Triage");
    expect(html).toContain("Candidates is temporarily unavailable");
    expect(html).toContain('value="mail-items" selected=""');
    expect(html).toContain("Load more");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("A content-safe summary.");
    expect(html).not.toContain("Archive");
  });

  it("links only a resolved contact target and renders no placeholder", () => {
    const linked = renderToStaticMarkup(
      createElement(InboxContact, {
        contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
        href: "/access?person=prsn_sam",
        linked: true,
      }),
    );
    const plain = renderToStaticMarkup(
      createElement(InboxContact, {
        contact: { label: "acme.io" },
        linked: true,
      }),
    );

    expect(linked).toContain('href="/access?person=prsn_sam"');
    expect(linked).toContain("Open contact");
    expect(plain).toContain("acme.io");
    expect(plain).not.toContain("href=");
    expect(plain).not.toContain("Unknown contact");
  });

  it("renders nothing when an item has no contact", () => {
    const entry = data.entries[0];
    if (!entry) throw new Error("Expected inbox fixture entry");
    const { contact: _contact, ...item } = entry.item;
    const html = renderToStaticMarkup(
      createElement(UnifiedInboxWorkspace, {
        data: {
          ...data,
          entries: [{ source: entry.source, item, followUps: entry.followUps }],
        },
        query: { offset: 0, limit: 50 },
        onQueryChange: () => {},
        onFollowUp: () => {},
        onAction: async () => ({ kind: "completed" as const }),
      }),
    );

    expect(html).not.toContain('class="inbox-contact"');
    expect(html).not.toContain("Unknown contact");
  });

  it("renders a stable filtered empty state without a paging control", () => {
    const html = renderToStaticMarkup(
      createElement(UnifiedInboxWorkspace, {
        data: { ...data, entries: [], total: 0 },
        query: { urgency: "normal", offset: 0, limit: 50 },
        onQueryChange: () => {},
        onFollowUp: () => {},
        onAction: async () => ({ kind: "completed" as const }),
      }),
    );

    expect(html).toContain("Nothing needs attention for these filters");
    expect(html).not.toContain("Load more");
  });
});

describe("UnifiedInboxWorkspace query changes", () => {
  let windowInstance: Window;
  let root: Root;

  beforeEach(() => {
    windowInstance = new Window({
      url: "https://brain.test/cms/workspaces/inbox",
    });
    const win = windowInstance as unknown as Window & Record<string, unknown>;
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      navigator: windowInstance.navigator,
      HTMLElement: win.HTMLElement,
      Element: win.Element,
      Node: win.Node,
      Event: win.Event,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const container = windowInstance.document.createElement("div");
    windowInstance.document.body.append(container);
    root = createRoot(container as unknown as HTMLElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    windowInstance.close();
  });

  it("renders registered follow-ups separately from resolution actions", async () => {
    type FollowUp = NonNullable<
      InboxWorkspaceSnapshot["entries"][number]["followUps"]
    >[number];
    const firstEntry = data.entries[0];
    if (!firstEntry) throw new Error("Expected inbox fixture entry");
    const opened: FollowUp[] = [];
    await act(async () => {
      root.render(
        createElement(UnifiedInboxWorkspace, {
          data,
          query: {},
          onQueryChange: () => {},
          onFollowUp: (followUp) => opened.push(followUp),
          onAction: async () => ({ kind: "completed" as const }),
        }),
      );
    });
    const row = windowInstance.document.querySelector(".inbox-row");
    if (!(row instanceof windowInstance.HTMLButtonElement)) {
      throw new Error("Missing inbox row");
    }

    await act(async () => row.click());

    const detail = windowInstance.document.querySelector(".inbox-detail-pane");
    expect(detail?.textContent).toContain("Follow up");
    expect(detail?.textContent).toContain("Discuss in chat");
    expect(detail?.textContent).toContain("Open source entity");
    expect(detail?.textContent).toContain("Available actions");
    expect(detail?.textContent).toContain("Archive");
    expect(
      [...(detail?.querySelectorAll("button") ?? [])].filter(
        (button) => button.textContent === "Open source entity",
      ),
    ).toHaveLength(1);

    const discuss = [...(detail?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Discuss in chat",
    );
    if (!(discuss instanceof windowInstance.HTMLButtonElement)) {
      throw new Error("Missing Discuss in chat follow-up");
    }
    await act(async () => discuss.click());

    expect(opened).toEqual(firstEntry.followUps.slice(0, 1));
  });

  it("renders no follow-up group or legacy entity button when none resolve", async () => {
    const entry = data.entries[0];
    if (!entry) throw new Error("Expected inbox fixture entry");
    await act(async () => {
      root.render(
        createElement(UnifiedInboxWorkspace, {
          data: { ...data, entries: [{ ...entry, followUps: [] }] },
          query: {},
          onQueryChange: () => {},
          onFollowUp: () => {},
          onAction: async () => ({ kind: "completed" as const }),
        }),
      );
    });
    const row = windowInstance.document.querySelector(".inbox-row");
    if (!(row instanceof windowInstance.HTMLButtonElement)) {
      throw new Error("Missing inbox row");
    }

    await act(async () => row.click());

    const detail = windowInstance.document.querySelector(".inbox-detail-pane");
    expect(detail?.textContent).not.toContain("Follow up");
    expect(detail?.textContent).not.toContain("Open source entity");
    expect(detail?.textContent).toContain("Available actions");
  });

  it("publishes stable filters separately from the first-page request", async () => {
    const changes: Array<{
      request: Record<string, string | number | undefined>;
      urlQuery?: Record<string, string | number | undefined> | undefined;
    }> = [];
    await act(async () => {
      root.render(
        createElement(UnifiedInboxWorkspace, {
          data,
          query: {},
          onQueryChange: (request, urlQuery) => {
            changes.push({ request, ...(urlQuery ? { urlQuery } : {}) });
          },
          onFollowUp: () => {},
          onAction: async () => ({ kind: "completed" as const }),
        }),
      );
    });
    const source = windowInstance.document.querySelector(
      ".inbox-filters select",
    );
    if (!(source instanceof windowInstance.HTMLSelectElement)) {
      throw new Error("Missing source filter");
    }

    await act(async () => {
      source.value = "mail-items";
      source.dispatchEvent(
        new windowInstance.Event("change", { bubbles: true }),
      );
    });

    expect(changes).toEqual([
      {
        request: { sourceId: "mail-items", offset: 0, limit: 50 },
        urlQuery: { sourceId: "mail-items" },
      },
    ]);
  });

  it("keeps Load more paging transient", async () => {
    const changes: Array<{
      request: Record<string, string | number | undefined>;
      urlQuery?: Record<string, string | number | undefined> | undefined;
    }> = [];
    await act(async () => {
      root.render(
        createElement(UnifiedInboxWorkspace, {
          data,
          query: { sourceId: "mail-items" },
          onQueryChange: (request, urlQuery) => {
            changes.push({ request, ...(urlQuery ? { urlQuery } : {}) });
          },
          onFollowUp: () => {},
          onAction: async () => ({ kind: "completed" as const }),
        }),
      );
    });
    const loadMore = [
      ...windowInstance.document.querySelectorAll("button"),
    ].find((button) => button.textContent === "Load more");
    if (!(loadMore instanceof windowInstance.HTMLButtonElement)) {
      throw new Error("Missing Load more button");
    }

    await act(async () => loadMore.click());

    expect(changes).toEqual([
      {
        request: {
          sourceId: "mail-items",
          offset: data.entries.length,
          limit: 50,
        },
      },
    ]);
  });

  it("canonicalizes malformed and orphaned stable URL fields", async () => {
    const changes: Array<{
      request: Record<string, string | number | undefined>;
      urlQuery?: Record<string, string | number | undefined> | undefined;
    }> = [];
    await act(async () => {
      root.render(
        createElement(UnifiedInboxWorkspace, {
          data,
          query: {
            sourceId: "missing-source",
            urgency: "urgent",
            "facet.category": "orphaned",
          },
          onQueryChange: (request, urlQuery) => {
            changes.push({ request, ...(urlQuery ? { urlQuery } : {}) });
          },
          onFollowUp: () => {},
          onAction: async () => ({ kind: "completed" as const }),
        }),
      );
    });

    expect(changes).toEqual([
      { request: { offset: 0, limit: 50 }, urlQuery: {} },
    ]);
  });
});
