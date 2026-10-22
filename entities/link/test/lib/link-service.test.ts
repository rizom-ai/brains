import { describe, it, expect, spyOn } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import {
  createEntityPluginContext,
  createMockShell,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { LinkService } from "../../src/lib/link-service";
import { UrlUtils } from "../../src/lib/url-utils";
import type { LinkEntity } from "../../src/schemas/link";
import { mockLinkContent } from "../fixtures/link-entities";

const withoutDescription = `---
status: draft
title: Bare Article
url: https://sub.example.org/bare
domain: sub.example.org
capturedAt: "2025-02-01T09:00:00.000Z"
source:
  ref: "cli:local"
  label: CLI
---

Bare summary`;

function createLinkServiceWithResults(): {
  service: LinkService;
  search: ReturnType<typeof spyOn>;
} {
  const shell = createMockShell({ logger: createSilentLogger() });
  const context = createEntityPluginContext(shell, "link");
  const search = spyOn(context.entityService, "search").mockResolvedValue([
    {
      entity: createTestEntity<LinkEntity>("link", {
        id: "link-with-description",
        content: mockLinkContent.simple,
      }),
      score: 1,
      excerpt: "",
    },
    {
      entity: createTestEntity<LinkEntity>("link", {
        id: "link-without-description",
        content: withoutDescription,
      }),
      score: 1,
      excerpt: "",
    },
  ]);
  return { service: new LinkService(context), search };
}

const summaryWithDescription = {
  id: "link-with-description",
  title: "Test Article",
  url: "https://example.com/test",
  description: "Test description",
  domain: "example.com",
  capturedAt: "2025-01-30T10:00:00.000Z",
};

const expectedSummaries = [
  summaryWithDescription,
  {
    id: "link-without-description",
    title: "Bare Article",
    url: "https://sub.example.org/bare",
    domain: "sub.example.org",
    capturedAt: "2025-02-01T09:00:00.000Z",
  },
];

describe("LinkService", () => {
  describe("listLinks", () => {
    it("maps search results to link summaries", async () => {
      const { service, search } = createLinkServiceWithResults();

      const links = await service.listLinks(5);

      expect(links).toEqual(expectedSummaries);
      expect(links[1]).not.toHaveProperty("description");
      expect(search).toHaveBeenCalledWith({
        query: "",
        options: {
          types: ["link"],
          limit: 5,
          sortBy: "created",
          sortDirection: "desc",
        },
      });
    });
  });

  describe("searchLinks", () => {
    it("maps search results to link summaries", async () => {
      const { service, search } = createLinkServiceWithResults();

      const links = await service.searchLinks("article", 7);

      expect(links).toEqual(expectedSummaries);
      expect(links[1]).not.toHaveProperty("description");
      expect(search).toHaveBeenCalledWith({
        query: "article",
        options: {
          types: ["link"],
          limit: 7,
          sortBy: "created",
          sortDirection: "desc",
        },
      });
    });
  });

  describe("getLink", () => {
    it("maps the entity to a link detail with summary and status", async () => {
      const shell = createMockShell({ logger: createSilentLogger() });
      shell.addEntities([
        createTestEntity<LinkEntity>("link", {
          id: "link-with-description",
          content: mockLinkContent.simple,
          metadata: {
            status: "draft",
            title: "Test Article",
            capturedAt: "2025-01-30T10:00:00.000Z",
          },
        }),
      ]);
      const service = new LinkService(createEntityPluginContext(shell, "link"));

      expect(await service.getLink("link-with-description")).toEqual({
        ...summaryWithDescription,
        summary: "Test summary",
        status: "draft",
      });
      expect(await service.getLink("missing")).toBeNull();
    });
  });

  describe("UrlUtils", () => {
    it("should generate deterministic entity IDs", () => {
      const url1 = "https://example.com/article";
      const url2 = "https://example.com/article?utm_source=twitter";

      const id1 = UrlUtils.generateEntityId(url1);
      const id2 = UrlUtils.generateEntityId(url2);

      // Should be deterministic
      expect(UrlUtils.generateEntityId(url1)).toBe(id1);
      // Should normalize URLs (remove tracking params)
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^example-com-[a-f0-9]{6}$/);
    });

    it("should handle different domains", () => {
      const githubUrl = "https://github.com/user/repo";
      const googleUrl = "https://google.com/search?q=test";

      const githubId = UrlUtils.generateEntityId(githubUrl);
      const googleId = UrlUtils.generateEntityId(googleUrl);

      expect(githubId).toMatch(/^github-com-[a-f0-9]{6}$/);
      expect(googleId).toMatch(/^google-com-[a-f0-9]{6}$/);
      expect(githubId).not.toBe(googleId);
    });
  });
});
