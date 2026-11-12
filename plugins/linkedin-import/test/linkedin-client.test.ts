import { describe, expect, it } from "bun:test";
import { LinkedInClient, type LinkedInFetch } from "../src/lib/linkedin-client";
import profileSnapshot from "./fixtures/profile-snapshot.json" with { type: "json" };

interface Recorded {
  url: URL;
  headers: Headers;
}

function recordingFetch(responses: Response[]): {
  fetch: LinkedInFetch;
  requests: Recorded[];
} {
  const requests: Recorded[] = [];
  const fetch: LinkedInFetch = async (input, init) => {
    requests.push({
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
    });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected LinkedIn request");
    return next;
  };
  return { fetch, requests };
}

const noData = (): Response =>
  new Response('{"message":"No data found for this memberId"}', {
    status: 404,
  });

describe("LinkedInClient", () => {
  it("reads every PROFILE page with the versioned API headers", async () => {
    const { fetch, requests } = recordingFetch([
      Response.json(profileSnapshot),
      noData(),
    ]);

    const records = await new LinkedInClient("token-1", fetch).fetchProfile();

    expect(records).toHaveLength(1);
    expect(records[0]?.["First Name"]).toBe("Ada");
    expect(requests).toHaveLength(2);
    const [first, second] = requests;
    expect(first?.url.href.split("?")[0]).toBe(
      "https://api.linkedin.com/rest/memberSnapshotData",
    );
    expect(first?.url.searchParams.get("q")).toBe("criteria");
    expect(first?.url.searchParams.get("domain")).toBe("PROFILE");
    expect(first?.url.searchParams.get("start")).toBe("0");
    expect(first?.headers.get("Authorization")).toBe("Bearer token-1");
    expect(first?.headers.get("Linkedin-Version")).toBe("202312");
    expect(second?.url.searchParams.get("start")).toBe("1");
  });

  it("reads a rich domain through the same pages", async () => {
    const { fetch, requests } = recordingFetch([
      Response.json({
        elements: [
          {
            snapshotDomain: "POSITIONS",
            snapshotData: [{ "Company Name": "Example" }],
          },
        ],
      }),
      noData(),
    ]);

    const records = await new LinkedInClient("token", fetch).fetchDomain(
      "POSITIONS",
    );

    expect(records).toEqual([{ "Company Name": "Example" }]);
    expect(requests[0]?.url.searchParams.get("domain")).toBe("POSITIONS");
  });

  it("stops at a page without records", async () => {
    const { fetch, requests } = recordingFetch([
      Response.json({ elements: [] }),
    ]);

    expect(await new LinkedInClient("token", fetch).fetchProfile()).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("reads LinkedIn's no-data answer as an empty profile", async () => {
    const { fetch } = recordingFetch([noData()]);

    expect(await new LinkedInClient("token", fetch).fetchProfile()).toEqual([]);
  });

  it("rejects a malformed page", async () => {
    const { fetch } = recordingFetch([Response.json({ elements: "invalid" })]);

    expect(new LinkedInClient("token", fetch).fetchProfile()).rejects.toThrow();
  });

  it("reports LinkedIn errors with a bounded body", async () => {
    const { fetch } = recordingFetch([
      new Response(`denied-${"x".repeat(2_000)}`, { status: 403 }),
    ]);

    expect(new LinkedInClient("token", fetch).fetchProfile()).rejects.toThrow(
      /^LinkedIn snapshot API error: 403 - denied-x{993}$/,
    );
  });
});
