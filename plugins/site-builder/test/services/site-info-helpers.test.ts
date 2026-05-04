import { describe, it, expect, mock } from "bun:test";
import { fetchSiteInfo } from "@brains/site-info";

describe("fetchSiteInfo", () => {
  it("should fetch and parse site-info entity", async () => {
    const entityService = {
      listEntities: mock(() =>
        Promise.resolve([
          {
            id: "site-info",
            content: `---
title: My Site
description: A test site
cta:
  heading: Get in touch
  buttonText: Say Hi
  buttonLink: mailto:test@test.com
---`,
          },
        ]),
      ),
    };

    const result = await fetchSiteInfo(entityService as never);
    expect(result.title).toBe("My Site");
    expect(result.description).toBe("A test site");
    expect(result.cta?.heading).toBe("Get in touch");
    expect(result.cta?.buttonText).toBe("Say Hi");
    expect(entityService.listEntities).toHaveBeenCalledWith({
      entityType: "site-info",
      options: { limit: 1 },
    });
  });

  it("should return site-info without cta (cta is optional)", async () => {
    const entityService = {
      listEntities: mock(() =>
        Promise.resolve([
          {
            id: "site-info",
            content: `---
title: Minimal Site
description: No CTA
---`,
          },
        ]),
      ),
    };

    const result = await fetchSiteInfo(entityService as never);
    expect(result.title).toBe("Minimal Site");
    expect(result.cta).toBeUndefined();
  });

  it("should throw when no site-info entity exists", async () => {
    const entityService = {
      listEntities: mock(() => Promise.resolve([])),
    };

    expect(fetchSiteInfo(entityService as never)).rejects.toThrow(
      "Site info not found",
    );
  });
});
