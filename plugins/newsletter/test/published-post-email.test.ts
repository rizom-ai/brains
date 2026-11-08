import { createMockEntityService } from "@brains/entity-service/test";
import { describe, expect, it, spyOn } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { ButtondownNewsletterProvider } from "../src/provider/buttondown-provider";
import type { ButtondownFetch } from "../src/provider/lib/buttondown-client";
import { handlePublishCompleted } from "../src/provider/publish-handler";

const logger = createSilentLogger("published-post-email");

const requestSchema = z.object({
  subject: z.string(),
  body: z.string(),
  status: z.string(),
});

/**
 * What Buttondown receives when a post is published: the post's title as
 * the subject and its body as the email. A declared post reads back as its
 * body, its frontmatter its metadata, so its frontmatter never reaches the
 * email; the post plugin class's read handed over the stored document,
 * whose frontmatter Buttondown rendered as a rule and a heading.
 */
describe("the email a published post sends", () => {
  it("is the post's body under its title", async () => {
    const requests: Array<z.output<typeof requestSchema>> = [];
    const fetch: ButtondownFetch = (_url, options) => {
      requests.push(requestSchema.parse(JSON.parse(String(options.body))));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ id: "bd-1", subject: "s", status: "sent" }),
      });
    };
    const provider = new ButtondownNewsletterProvider(
      { apiKey: "key", doubleOptIn: true },
      logger,
      { fetch },
    );
    const entityService = createMockEntityService();
    spyOn(entityService, "getEntity").mockResolvedValue({
      id: "city-notes",
      entityType: "post",
      content: "## City\n\nThe **city** at dusk.",
      visibility: "public",
      metadata: {
        title: "City Notes",
        slug: "city-notes",
        status: "published",
        publishedAt: "2025-01-01T00:00:00.000Z",
        excerpt: "About the city.",
        author: "Alex",
        seriesName: "Cities",
        seriesIndex: 2,
      },
      contentHash: "",
      created: "",
      updated: "",
    });

    expect(
      await handlePublishCompleted(
        { entityType: "post", entityId: "city-notes", result: { id: "x" } },
        provider,
        entityService,
        logger,
      ),
    ).toEqual({ success: true, deliveryId: "bd-1" });

    const [request] = requests;
    expect(request?.subject).toBe("City Notes");
    expect(request?.status).toBe("about_to_send");
    const body = request?.body ?? "";
    expect(body.slice(body.indexOf("<main"), body.indexOf("</main>") + 7)).toBe(
      '<main class="content"><h2>City</h2>\n<p>The <strong>city</strong> at dusk.</p>\n</main>',
    );
  });
});
