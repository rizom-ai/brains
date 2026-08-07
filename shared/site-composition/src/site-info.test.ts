import { describe, expect, it } from "bun:test";
import { fetchSiteInfo, parseSiteInfoContent } from "./site-info";

const siteInfoContent = `---
represents: brain
title: My Site
description: A test site
---
`;

describe("parseSiteInfoContent", () => {
  it("parses the site-info frontmatter body", () => {
    const body = parseSiteInfoContent(siteInfoContent);

    expect(body.represents).toBe("brain");
    expect(body.title).toBe("My Site");
    expect(body.description).toBe("A test site");
  });

  it("rejects invalid frontmatter", () => {
    expect(() => parseSiteInfoContent(`---\ntitle: 42\n---\n`)).toThrow();
  });
});

describe("fetchSiteInfo", () => {
  it("fetches and parses the singleton site-info entity", async () => {
    const requests: unknown[] = [];
    const body = await fetchSiteInfo({
      listEntities: (request) => {
        requests.push(request);
        return Promise.resolve([{ content: siteInfoContent }]);
      },
    });

    expect(body.title).toBe("My Site");
    expect(requests).toEqual([
      { entityType: "site-info", options: { limit: 1 } },
    ]);
  });

  it("throws when no site-info entity exists", () => {
    void expect(
      fetchSiteInfo({ listEntities: () => Promise.resolve([]) }),
    ).rejects.toThrow("Site info not found");
  });
});
