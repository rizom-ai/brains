import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InboxWorkspaceSnapshot } from "./api";
import { UnifiedInboxWorkspace } from "./unified-inbox-workspace";

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
        receivedAt: "2026-08-08T09:00:00.000Z",
        urgency: "high",
        entityRef: { entityType: "mail-item", entityId: "mail-1" },
        actions: [{ id: "archive", label: "Archive", confirm: true }],
      },
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
    expect(html).toContain("Email Triage");
    expect(html).toContain("Candidates is temporarily unavailable");
    expect(html).toContain('value="mail-items" selected=""');
    expect(html).toContain("Load more");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("A content-safe summary.");
    expect(html).not.toContain("Archive");
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
