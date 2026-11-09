import { describe, expect, it } from "bun:test";
import { fetchSiteInfo, siteInfoFromRecord } from "./site-info";

const siteInfoContent = `---
represents: brain
title: My Site
description: A test site
---
`;

describe("siteInfoFromRecord", () => {
  it("parses the site-info frontmatter body", () => {
    const body = siteInfoFromRecord({ content: siteInfoContent });

    expect(body.represents).toBe("brain");
    expect(body.title).toBe("My Site");
    expect(body.description).toBe("A test site");
  });

  it("rejects invalid frontmatter", () => {
    expect(() =>
      siteInfoFromRecord({ content: `---\ntitle: 42\n---\n` }),
    ).toThrow();
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

  it("reads a declared site-info's fields from its metadata", async () => {
    const body = await fetchSiteInfo({
      listEntities: () =>
        Promise.resolve([
          {
            content: "",
            metadata: {
              title: "My Site",
              themeMode: "light",
              cta: {
                heading: "Get in touch",
                buttonText: "Say hello",
                buttonLink: "mailto:me@example.com",
              },
            },
          },
        ]),
    });

    expect(body.title).toBe("My Site");
    expect(body.themeMode).toBe("light");
    expect(body.cta?.buttonText).toBe("Say hello");
  });

  it("throws when no site-info entity exists", () => {
    void expect(
      fetchSiteInfo({ listEntities: () => Promise.resolve([]) }),
    ).rejects.toThrow("Site info not found");
  });
});
