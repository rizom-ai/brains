import { afterEach, describe, expect, it } from "bun:test";
import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAuditEventSummary,
  type AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import { mockFetch } from "@brains/test-utils";
import { createAdminQueryClient } from "./query-client";
import {
  adminKeys,
  anchorQueryOptions,
  auditQueryOptions,
  invalidateAfterAdminMutation,
  usersQueryOptions,
} from "./queries";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Admin server-state queries", () => {
  it("deduplicates the private roster request by stable key", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json({ users: [] });
    });
    const client = createAdminQueryClient();

    const [first, second] = await Promise.all([
      client.fetchQuery(usersQueryOptions()),
      client.fetchQuery(usersQueryOptions()),
    ]);

    expect(adminKeys.users()).toEqual(["admin", "users"]);
    expect(first).toEqual([]);
    expect(second).toBe(first);
    expect(requests).toBe(1);
    client.clear();
  });

  it("loads Anchor and audit records into separate caches", async () => {
    mockFetch(async (request) => {
      const url = String(request);
      if (url.endsWith("/auth/admin/anchor")) {
        return Response.json({
          anchor: {
            kind: "collective",
            configuredKind: "organization",
            subjectId: "collective:rizom",
            displayName: "Rizom",
            administeredBy: 2,
          },
        });
      }
      return Response.json({ events: [] });
    });
    const client = createAdminQueryClient();

    const [anchor, audit] = await Promise.all([
      client.fetchQuery(anchorQueryOptions()),
      client.fetchQuery(auditQueryOptions()),
    ]);

    expect(anchor.displayName).toBe("Rizom");
    expect(audit).toEqual([]);
    expect(
      client.getQueryData<AuthBrainAnchorSummary>(adminKeys.anchor()),
    ).toBe(anchor);
    expect(
      client.getQueryData<AuthAuditEventSummary[]>(adminKeys.audit()),
    ).toBe(audit);
    client.clear();
  });
});

describe("Admin mutation invalidation", () => {
  it("refreshes Overview, roster, invitations, and audit together", async () => {
    const client = createAdminQueryClient();
    client.setQueryData(adminKeys.anchor(), { displayName: "Before" });
    client.setQueryData(adminKeys.users(), []);
    client.setQueryData(adminKeys.audit(), []);

    await invalidateAfterAdminMutation(
      client,
      AUTH_ADMIN_MUTATION_ACTIONS.linkExternalPeer,
    );

    expect(client.getQueryState(adminKeys.anchor())?.isInvalidated).toBe(true);
    expect(client.getQueryState(adminKeys.users())?.isInvalidated).toBe(true);
    expect(client.getQueryState(adminKeys.audit())?.isInvalidated).toBe(true);
    client.clear();
  });
});
