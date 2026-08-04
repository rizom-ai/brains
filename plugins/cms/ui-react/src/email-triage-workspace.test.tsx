import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  MailTriageStatusActionResult,
  MailTriageWorkspaceSnapshot,
} from "./api";
import {
  EmailTriageWorkspace,
  filterMailTriageItems,
} from "./email-triage-workspace";

const data: MailTriageWorkspaceSnapshot = {
  summary: {
    total: 3,
    new: 2,
    high: 2,
    needsReply: 2,
    unclassified: 0,
  },
  items: [
    {
      id: "mail-opportunity",
      title: "Possible collaboration",
      category: "opportunity",
      priority: "high",
      status: "new",
      needsReply: true,
      receivedAt: "2026-08-03T09:00:00.000Z",
      summary: "A prospective collaborator asks about availability.",
      requestedActions: ["Review availability"],
    },
    {
      id: "mail-admin",
      title: "Account notice",
      category: "administrative",
      priority: "high",
      status: "new",
      needsReply: false,
      receivedAt: "2026-08-02T09:00:00.000Z",
      summary: "An account operation needs review.",
      requestedActions: [],
    },
    {
      id: "mail-work",
      title: "Project update",
      category: "work",
      priority: "normal",
      status: "reviewed",
      needsReply: true,
      receivedAt: "2026-08-01T09:00:00.000Z",
      summary: "An existing project has a status update.",
      requestedActions: ["Prepare a response"],
    },
  ],
};

describe("EmailTriageWorkspace", () => {
  it("applies all selected filters together", () => {
    expect(
      filterMailTriageItems(data.items, {
        category: "opportunity",
        priority: "high",
        status: "new",
        needsReply: true,
      }).map((item) => item.id),
    ).toEqual(["mail-opportunity"]);
  });

  it("renders a quiet mail desk with typed lifecycle actions", () => {
    const onAction = async (): Promise<MailTriageStatusActionResult> => ({
      id: "mail-opportunity",
      status: "reviewed",
    });
    const html = renderToStaticMarkup(
      createElement(EmailTriageWorkspace, { data, onAction }),
    );

    expect(html).toContain("Mail desk");
    expect(html).toContain("Possible collaboration");
    expect(html).toContain("A prospective collaborator asks");
    expect(html).toContain("Category");
    expect(html).toContain("Priority");
    expect(html).toContain("Status");
    expect(html).toContain("Needs reply");
    expect(html).toContain("Mark reviewed");
    expect(html).toContain("Mark handled");
    expect(html).toContain("Archive");
    expect(html).not.toContain("sourceRef");
    expect(html).not.toContain("sender@example.com");
  });
});
