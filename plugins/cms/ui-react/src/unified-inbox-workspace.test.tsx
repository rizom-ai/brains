import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
        receivedAt: "2026-08-08T09:00:00.000Z",
        urgency: "high",
        entityRef: { entityType: "mail-item", entityId: "mail-1" },
        actions: [{ id: "archive", label: "Archive", confirm: true }],
      },
      contactHref: "/access?person=prsn_sam",
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
        onOpenEntity: () => {},
        onAction: async () => ({ kind: "completed" as const }),
      }),
    );

    expect(html).toContain("Live source-owned attention");
    expect(html).toContain("Time-sensitive collaboration request");
    expect(html).toContain("Sam Rivera · acme.io");
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
          entries: [{ source: entry.source, item }],
        },
        query: { offset: 0, limit: 50 },
        onQueryChange: () => {},
        onOpenEntity: () => {},
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
        onOpenEntity: () => {},
        onAction: async () => ({ kind: "completed" as const }),
      }),
    );

    expect(html).toContain("Nothing needs attention for these filters");
    expect(html).not.toContain("Load more");
  });
});
