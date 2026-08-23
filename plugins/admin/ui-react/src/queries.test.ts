import { afterEach, describe, expect, it } from "bun:test";
import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import { mockFetch } from "@brains/test-utils";
import { createAdminQueryClient } from "./query-client";
import {
  adminKeys,
  anchorQueryOptions,
  channelsQueryOptions,
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

  it("loads registered channel metadata without local channel choices", async () => {
    mockFetch(async () =>
      Response.json({
        channels: [
          {
            type: "slack",
            displayName: "Slack",
            subjectLabel: "Slack member ID",
            deliveryModes: ["manual"],
          },
        ],
      }),
    );
    const client = createAdminQueryClient();

    expect(await client.fetchQuery(channelsQueryOptions())).toEqual([
      {
        type: "slack",
        displayName: "Slack",
        subjectLabel: "Slack member ID",
        deliveryModes: ["manual"],
      },
    ]);
    expect(adminKeys.channels()).toEqual(["admin", "channels"]);
    client.clear();
  });

  it("loads the Anchor record into its own cache", async () => {
    mockFetch(async () =>
      Response.json({
        anchor: {
          kind: "collective",
          configuredKind: "organization",
          subjectId: "collective:rizom",
          displayName: "Rizom",
          administeredBy: 2,
        },
      }),
    );
    const client = createAdminQueryClient();

    const anchor = await client.fetchQuery(anchorQueryOptions());

    expect(anchor.displayName).toBe("Rizom");
    expect(
      client.getQueryData<AuthBrainAnchorSummary>(adminKeys.anchor()),
    ).toBe(anchor);
    client.clear();
  });
});

describe("Admin mutation invalidation", () => {
  it("refreshes all private administration state together", async () => {
    const client = createAdminQueryClient();
    client.setQueryData(adminKeys.anchor(), { displayName: "Before" });
    client.setQueryData(adminKeys.users(), []);
    client.setQueryData(adminKeys.channels(), []);

    await invalidateAfterAdminMutation(
      client,
      AUTH_ADMIN_MUTATION_ACTIONS.linkExternalPeer,
    );

    expect(client.getQueryState(adminKeys.anchor())?.isInvalidated).toBe(true);
    expect(client.getQueryState(adminKeys.users())?.isInvalidated).toBe(true);
    expect(client.getQueryState(adminKeys.channels())?.isInvalidated).toBe(
      true,
    );
    client.clear();
  });
});
