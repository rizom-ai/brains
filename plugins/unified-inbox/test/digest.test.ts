import { describe, expect, it } from "bun:test";
import {
  createUnifiedInboxDigest,
  inboxProjectionSchema,
  runUnifiedInboxDigest,
  unifiedInboxDigestCheck,
  type InboxDigestCheckContext,
} from "../src";

const projection = inboxProjectionSchema.parse({
  entries: [
    {
      source: { sourceId: "mail-items", displayName: "Email Triage" },
      item: {
        id: "mail-high",
        title: "Time-sensitive work request",
        summary: "Private derived detail that must not enter the digest.",
        contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
        receivedAt: "2026-08-05T10:00:00.000Z",
        urgency: "high",
        actions: [{ id: "archive", label: "Archive" }],
      },
    },
    {
      source: { sourceId: "agent-candidates", displayName: "Candidates" },
      item: {
        id: "candidate-high",
        title: "Possible collaborator",
        receivedAt: "2026-08-05T09:00:00.000Z",
        urgency: "high",
        actions: [{ id: "add", label: "Add" }],
      },
    },
    {
      source: { sourceId: "mail-items", displayName: "Email Triage" },
      item: {
        id: "mail-normal",
        title: "Routine project update",
        receivedAt: "2026-08-05T08:00:00.000Z",
        urgency: "normal",
        actions: [{ id: "mark-reviewed", label: "Mark reviewed" }],
      },
    },
  ],
  errors: [
    {
      source: { sourceId: "stale-work", displayName: "Stale work" },
      error: "Source unavailable",
    },
  ],
});

function checkContext(
  workspaces: Record<string, string>,
): InboxDigestCheckContext {
  return {
    signal: new AbortController().signal,
    siteUrl: "https://brain.test",
    workspaceUrl: (id) => workspaces[id],
  };
}

const now = (): Date => new Date("2026-08-05T12:00:00.000Z");

describe("unified inbox digest", () => {
  it("summarizes per-source counts and high-priority titles only", () => {
    const alert = createUnifiedInboxDigest(projection, {
      destinationUrl: "https://brain.test/dashboard",
      now,
    });

    expect(alert).toEqual({
      dedupeKey: "unified-inbox:daily-digest:2026-08-05",
      title: "Inbox digest — 3 open",
      body: [
        "3 open attention items · 2 high priority",
        "",
        "Email Triage — 2 open · 1 high",
        "- Time-sensitive work request",
        "",
        "Candidates — 1 open · 1 high",
        "- Possible collaborator",
        "",
        "1 source unavailable. Open Inbox: https://brain.test/dashboard",
      ].join("\n"),
    });
    const serialized = JSON.stringify(alert);
    expect(serialized).not.toContain(
      "Private derived detail that must not enter the digest.",
    );
    expect(serialized).not.toContain("Sam Rivera · acme.io");
    expect(serialized).not.toContain("prsn_sam");
    expect(serialized).not.toContain("Routine project update");
    expect(serialized).not.toContain("mail-high");
    expect(serialized).not.toContain("Archive");
  });

  it("stays silent when no inbox item is open", () => {
    expect(
      createUnifiedInboxDigest(
        { entries: [], errors: projection.errors },
        { destinationUrl: "/dashboard", now },
      ),
    ).toBeUndefined();
  });

  it("declares one daily check against the live projection", async () => {
    expect(
      unifiedInboxDigestCheck({ getInboxData: async () => projection }),
    ).toMatchObject({
      id: "daily-digest",
      cadence: "daily",
      includeInInbox: false,
    });

    const run = runUnifiedInboxDigest(
      { getInboxData: async () => projection },
      { now },
    );
    const result = await run(
      checkContext({ inbox: "/studio/workspaces/@brains/unified-inbox:inbox" }),
    );
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.body).toContain(
      "Open Inbox: https://brain.test/studio/workspaces/@brains/unified-inbox:inbox",
    );
  });

  // Without Studio there is no Inbox page, and the digest says so by pointing
  // at the brain itself rather than guessing at a route another package owns.
  it("points at the brain when Studio mounted no workspace", async () => {
    const run = runUnifiedInboxDigest(
      { getInboxData: async () => projection },
      { now },
    );

    const result = await run(checkContext({}));
    expect(result.alerts[0]?.body).toContain("Open Inbox: https://brain.test/");
  });
});
