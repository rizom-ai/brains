import { afterEach, describe, expect, test } from "bun:test";
import { contactRequestEntity, contactRequestTarget } from "@brains/contact";
import {
  defineEntity,
  defineEntityPackage,
  withFrontmatterSchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * A declared type that presents its class's header writes the fields its
 * metadata names, whatever it presents: a header field its metadata does
 * not name is the file's own, kept from the document written (a contact
 * request's name and email), and a metadata field it does not write never
 * leaks from the source into the file (a post's generation error).
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(
  definition: Parameters<typeof defineEntityPackage>[0],
  pluginId: string,
): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    defineEntityPackage(definition),
    "@fixture/frontmatter",
    pluginId,
  );
  stores.push(opened);
  return opened;
}

describe("what a declared type writes, apart from what it presents", () => {
  test("keeps a header field its metadata does not name", async () => {
    const opened = await store(
      { id: "contact-request", entities: [contactRequestEntity] },
      "contact-request",
    );
    // The contact target reads a submission's answers and when it came.
    const submission = z
      .custom<Parameters<typeof contactRequestTarget.record>[0]>()
      .parse({
        answers: { name: "Ada", email: "ada@example.com", message: "Hello." },
        receivedAt: Date.parse("2026-04-15T09:00:00.000Z"),
      });
    const record = contactRequestTarget.record(submission);
    await opened.service.createEntity({
      entity: {
        id: "c1",
        entityType: "contact-request",
        visibility: "restricted",
        content: record.content,
        metadata: record.metadata,
      },
    });
    expect((await opened.stored("contact-request", "c1"))?.content).toBe(
      "---\nname: Ada\nemail: ada@example.com\nreceivedAt: '2026-04-15T09:00:00.000Z'\nstatus: new\nnotification: pending\nvisibility: restricted\n---\nHello.\n",
    );
  });

  test("never keeps a metadata field it does not write from the source", async () => {
    const header = z.object({ title: z.string() });
    const article = withFrontmatterSchema(
      defineEntity({
        type: "article",
        purpose: "An article whose metadata holds a generation error.",
        metadata: z.object({
          title: z.string(),
          error: z.string().optional(),
        }),
      }),
      header,
    );
    const opened = await store(
      { id: "article", entities: [article] },
      "article",
    );
    await opened.service.createEntity({
      entity: {
        id: "a1",
        entityType: "article",
        visibility: "public",
        // The source still says the generation failed; the type no longer
        // carries the error.
        content: "---\ntitle: First\nerror: the model timed out\n---\nBody\n",
        metadata: { title: "First" },
      },
    });
    expect((await opened.stored("article", "a1"))?.content).toBe(
      "---\ntitle: First\n---\nBody\n",
    );
  });
});
