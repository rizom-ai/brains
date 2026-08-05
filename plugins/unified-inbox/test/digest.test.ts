import { describe, expect, it } from "bun:test";
import type { ServicePluginContext } from "@brains/plugins";

import {
  createUnifiedInboxDigest,
  inboxDigestAlertSchema,
  inboxProjectionSchema,
  registerUnifiedInboxDigest,
} from "../src";

const projection = inboxProjectionSchema.parse({
  entries: [
    {
      source: { sourceId: "mail-items", displayName: "Email Triage" },
      item: {
        id: "mail-high",
        title: "Time-sensitive work request",
        summary: "Private derived detail that must not enter the digest.",
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

type RecurringCheckDefinition = Parameters<
  ServicePluginContext["recurringChecks"]["register"]
>[0];

const now = (): Date => new Date("2026-08-05T12:00:00.000Z");

describe("unified inbox digest", () => {
  it("summarizes per-source counts and high-priority titles only", () => {
    const alert = inboxDigestAlertSchema.parse(
      createUnifiedInboxDigest(projection, {
        dashboardUrl: "https://brain.test/dashboard",
        now,
      }),
    );

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
    expect(serialized).not.toContain("Routine project update");
    expect(serialized).not.toContain("mail-high");
    expect(serialized).not.toContain("Archive");
  });

  it("stays silent when no inbox item is open", () => {
    expect(
      createUnifiedInboxDigest(
        { entries: [], errors: projection.errors },
        { dashboardUrl: "/dashboard", now },
      ),
    ).toBeUndefined();
  });

  it("registers one daily recurring check against the live projection", async () => {
    let check: RecurringCheckDefinition | undefined;
    registerUnifiedInboxDigest(
      {
        siteUrl: "https://brain.test",
        recurringChecks: {
          register: (definition): (() => void) => {
            check = definition;
            return (): void => undefined;
          },
        },
        webRoutes: {
          getRoutes: () => [
            {
              pluginId: "dashboard",
              fullPath: "/ops",
              definition: {
                path: "/ops",
                method: "GET",
                handler: (): Response => new Response(),
              },
            },
          ],
        },
      },
      { getInboxData: async () => projection },
      now,
    );

    expect(check).toMatchObject({
      id: "daily-digest",
      cadence: "daily",
    });
    if (!check) throw new Error("Daily inbox check was not registered");
    const result = await check.run({ signal: new AbortController().signal });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts?.[0]?.body).toContain(
      "Open Inbox: https://brain.test/ops",
    );
  });
});
