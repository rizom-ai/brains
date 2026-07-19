import { afterEach, describe, expect, it } from "bun:test";
import { mockFetch } from "@brains/test-utils";
import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAgentPersonSummary,
  type AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import { createAdminQueryClient } from "./query-client";
import {
  adminKeys,
  anchorQueryOptions,
  invalidateAfterAdminMutation,
  invalidateAfterRepresentationMutation,
  representationsQueryOptions,
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

  it("loads Anchor and representation records into separate caches", async () => {
    mockFetch(async (request) => {
      const url = String(request);
      if (url.endsWith("/auth/admin/anchor")) {
        return Response.json({
          anchor: {
            kind: "collective",
            subjectId: "collective:rizom",
            displayName: "Rizom",
            administeredBy: 2,
          },
        });
      }
      return Response.json({ representations: [] });
    });
    const client = createAdminQueryClient();

    const [anchor, representations] = await Promise.all([
      client.fetchQuery(anchorQueryOptions()),
      client.fetchQuery(representationsQueryOptions()),
    ]);

    expect(anchor.displayName).toBe("Rizom");
    expect(representations).toEqual([]);
    expect(
      client.getQueryData<AuthBrainAnchorSummary>(adminKeys.anchor()),
    ).toBe(anchor);
    expect(
      client.getQueryData<AuthAgentPersonSummary[]>(
        adminKeys.representations(),
      ),
    ).toBe(representations);
    client.clear();
  });
});

describe("Admin mutation invalidation", () => {
  it("invalidates Anchor, roster, and representations after ownership changes", async () => {
    const client = createAdminQueryClient();
    client.setQueryData(adminKeys.anchor(), { displayName: "Before" });
    client.setQueryData(adminKeys.users(), []);
    client.setQueryData(adminKeys.representations(), []);

    await invalidateAfterAdminMutation(
      client,
      AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor,
    );

    expect(client.getQueryState(adminKeys.anchor())?.isInvalidated).toBe(true);
    expect(client.getQueryState(adminKeys.users())?.isInvalidated).toBe(true);
    expect(
      client.getQueryState(adminKeys.representations())?.isInvalidated,
    ).toBe(true);
    client.clear();
  });

  it("does not refresh durable records for a transient setup URL", async () => {
    const client = createAdminQueryClient();
    client.setQueryData(adminKeys.anchor(), { displayName: "Before" });
    client.setQueryData(adminKeys.users(), []);
    client.setQueryData(adminKeys.representations(), []);

    await invalidateAfterAdminMutation(
      client,
      AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration,
    );

    expect(client.getQueryState(adminKeys.anchor())?.isInvalidated).toBe(false);
    expect(client.getQueryState(adminKeys.users())?.isInvalidated).toBe(false);
    expect(
      client.getQueryState(adminKeys.representations())?.isInvalidated,
    ).toBe(false);
    client.clear();
  });

  it("refreshes both representations and member detail after consent", async () => {
    const client = createAdminQueryClient();
    client.setQueryData(adminKeys.users(), []);
    client.setQueryData(adminKeys.representations(), []);

    await invalidateAfterRepresentationMutation(client);

    expect(client.getQueryState(adminKeys.users())?.isInvalidated).toBe(true);
    expect(
      client.getQueryState(adminKeys.representations())?.isInvalidated,
    ).toBe(true);
    client.clear();
  });
});
