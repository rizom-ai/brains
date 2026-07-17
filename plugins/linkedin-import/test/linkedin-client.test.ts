import { describe, expect, it, mock } from "bun:test";
import { LinkedInClient, type LinkedInFetch } from "../src/lib/linkedin-client";
import profileSnapshot from "./fixtures/profile-snapshot.json" with { type: "json" };

describe("LinkedInClient", () => {
  it("fetches PROFILE pages with the required versioned API headers", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const fetchFn = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: String(input),
          headers: new Headers(init?.headers),
        });
        if (requests.length === 1) {
          return Response.json(profileSnapshot);
        }
        return new Response("No data found for this memberId", {
          status: 404,
        });
      },
    ) as LinkedInFetch;

    const records = await new LinkedInClient(
      "test-access-token",
      fetchFn,
    ).fetchProfile();

    expect(records).toHaveLength(1);
    expect(records[0]?.["First Name"]).toBe("Ada");
    expect(requests).toHaveLength(2);

    const firstUrl = new URL(requests[0]?.url ?? "");
    expect(firstUrl.pathname).toBe("/rest/memberSnapshotData");
    expect(firstUrl.searchParams.get("q")).toBe("criteria");
    expect(firstUrl.searchParams.get("domain")).toBe("PROFILE");
    expect(firstUrl.searchParams.get("start")).toBe("0");
    expect(requests[0]?.headers.get("Authorization")).toBe(
      "Bearer test-access-token",
    );
    expect(requests[0]?.headers.get("Linkedin-Version")).toBe("202312");

    const secondUrl = new URL(requests[1]?.url ?? "");
    expect(secondUrl.searchParams.get("start")).toBe("1");
  });

  it("resolves a dynamic access token for each import request", async () => {
    const authorizations: string[] = [];
    const tokens = ["oauth-token-1", "oauth-token-2"];
    const provider = {
      getAccessToken: mock(async () => tokens.shift()),
    };
    const fetchFn = mock(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        authorizations.push(headers.get("Authorization") ?? "");
        return Response.json({ elements: [] });
      },
    ) as LinkedInFetch;
    const client = new LinkedInClient(provider, fetchFn);

    await client.fetchProfile();
    await client.fetchProfile();

    expect(authorizations).toEqual([
      "Bearer oauth-token-1",
      "Bearer oauth-token-2",
    ]);
    expect(provider.getAccessToken).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when a dynamic provider is not connected", async () => {
    const fetchFn = mock(async () => Response.json({ elements: [] }));
    const client = new LinkedInClient(
      { getAccessToken: mock(async () => undefined) },
      fetchFn as LinkedInFetch,
    );

    expect(client.fetchProfile()).rejects.toThrow("LinkedIn is not connected");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fetches supported rich professional domains through the same paging contract", async () => {
    const urls: string[] = [];
    const fetchFn = mock(async (input: string | URL | Request) => {
      urls.push(String(input));
      if (urls.length === 1) {
        return Response.json({
          paging: { start: 0 },
          elements: [
            {
              snapshotDomain: "POSITIONS",
              snapshotData: [{ "Company Name": "Example" }],
            },
          ],
        });
      }
      return new Response("No data found for this memberId", { status: 404 });
    }) as LinkedInFetch;

    const records = await new LinkedInClient("token", fetchFn).fetchDomain(
      "POSITIONS",
    );

    expect(records).toEqual([{ "Company Name": "Example" }]);
    expect(new URL(urls[0] ?? "").searchParams.get("domain")).toBe("POSITIONS");
  });

  it("returns an empty snapshot when LinkedIn reports no member data", async () => {
    const fetchFn = mock(
      async () =>
        new Response('{"message":"No data found for this memberId"}', {
          status: 404,
        }),
    ) as LinkedInFetch;

    const records = await new LinkedInClient("token", fetchFn).fetchProfile();

    expect(records).toEqual([]);
  });

  it("rejects malformed successful responses", async () => {
    const fetchFn = mock(async () =>
      Response.json({ elements: "invalid" }),
    ) as LinkedInFetch;

    expect(
      new LinkedInClient("token", fetchFn).fetchProfile(),
    ).rejects.toThrow();
  });

  it("surfaces bounded LinkedIn API errors", async () => {
    const fetchFn = mock(
      async () => new Response(`denied-${"x".repeat(2_000)}`, { status: 403 }),
    ) as LinkedInFetch;

    expect(new LinkedInClient("token", fetchFn).fetchProfile()).rejects.toThrow(
      /^LinkedIn snapshot API error: 403 - denied-x{1,1000}$/,
    );
  });
});
