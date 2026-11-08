import { afterEach, describe, expect, test } from "bun:test";
import decksPackage, {
  deckSchema,
  deckViewSchema,
  deckWithDataSchema,
  parseDeckData,
} from "@brains/decks";
import { imageMetadataSchema } from "@brains/image";
import { defineEntity, defineEntityPackage } from "@brains/plugins";
import { scopeEntityReads } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared decks on the brain's own entity store: every deck stored as
 * the deck adapter wrote it, byte for byte, whether imported, updated,
 * stubbed or generated, and created from pasted text as the deck plugin
 * class created it.
 */

// The images a deck names as its cover, as the images package stores them.
const images = defineEntityPackage({
  id: "images",
  entities: [
    defineEntity({
      type: "image",
      purpose: "An image.",
      metadata: imageMetadataSchema,
      config: { binaryStorage: "data-url" },
      markdown: { decode: ({ content }) => ({ content, metadata: {} }) },
    }),
  ],
});

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    decksPackage,
    "@brains/decks",
    "decks",
    { weight: 1.5, projectionSourceRole: "primary" },
    // The images a deck names as its cover.
    [images],
  );
  stores.push(opened);
  return opened;
}

async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<string | undefined> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "deck", id, markdown },
  });
  return (await opened.stored("deck", id))?.content;
}

async function generate(
  opened: DeclaredEntityStore,
  data: unknown,
): Promise<unknown> {
  const handler = opened.shell
    .getJobQueueService()
    .getHandler("deck:generation");
  if (!handler) throw new Error("No deck generation");
  return handler.process(
    handler.validateAndParse(data),
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

const full =
  "---\ntitle: Tidal Systems\nslug: tidal-systems\ndescription: How tides move\nauthor: Ada\nstatus: draft\nevent: Harbour Conf\ncoverImageId: tide-cover\n---\n# Tidal Systems\n\n---\n\n## Second\n\nBody\n";

describe("the declared decks on the entity store", () => {
  // Each expected document is what DeckAdapter.toMarkdown stored for it.
  test("stores an imported deck as the deck adapter wrote it", async () => {
    const opened = await store();
    expect(await imported(opened, "full", full)).toBe(full);
    expect(
      await imported(
        opened,
        "noslug",
        "---\ntitle: No Slug Deck\nstatus: draft\ndescription: Short\n---\n# No Slug\n\n---\n\nTwo\n",
      ),
    ).toBe(
      "---\ntitle: No Slug Deck\ndescription: Short\nstatus: draft\nslug: no-slug-deck\n---\n# No Slug\n\n---\n\nTwo\n",
    );
    expect(
      await imported(
        opened,
        "published",
        "---\ntitle: Out There\nstatus: published\npublishedAt: 2026-01-02T00:00:00.000Z\nslug: out-there\n---\n# Out\n\n---\n\nThere\n",
      ),
    ).toBe(
      "---\ntitle: Out There\nslug: out-there\nstatus: published\npublishedAt: '2026-01-02T00:00:00.000Z'\n---\n# Out\n\n---\n\nThere\n",
    );
    expect(
      await imported(
        opened,
        "quoted",
        "---\ntitle: 'Colon: Title'\nstatus: queued\nogImageId: og-x\n---\n\n# A\n---\nB",
      ),
    ).toBe(
      "---\ntitle: 'Colon: Title'\nstatus: queued\nogImageId: og-x\nslug: colon-title\n---\n# A\n---\nB\n",
    );
  });

  test("keeps its frontmatter through an update of its slides", async () => {
    const opened = await store();
    await imported(opened, "full", full);
    const read = await opened.service.getEntity({
      entityType: "deck",
      id: "full",
    });
    if (!read) throw new Error("Missing deck");
    expect(read.content).toBe("# Tidal Systems\n\n---\n\n## Second\n\nBody");

    await opened.service.updateEntity({
      entity: { ...read, content: read.content.replace("Body", "Changed") },
    });

    expect((await opened.stored("deck", "full"))?.content).toBe(
      full.replace("Body", "Changed"),
    );
  });

  test("writes a resolved slug where the file states it once stored", async () => {
    const opened = await store();
    await imported(
      opened,
      "noslug",
      "---\ntitle: No Slug Deck\nstatus: draft\ndescription: Short\n---\n# No Slug\n\n---\n\nTwo\n",
    );
    const read = await opened.service.getEntity({
      entityType: "deck",
      id: "noslug",
    });
    if (!read) throw new Error("Missing deck");
    await opened.service.updateEntity({
      entity: { ...read, content: read.content.replace("Two", "Changed") },
    });
    // As DeckAdapter stored it: the stored file states its slug, so the
    // update writes it where a stated slug goes.
    expect((await opened.stored("deck", "noslug"))?.content).toBe(
      "---\ntitle: No Slug Deck\nslug: no-slug-deck\ndescription: Short\nstatus: draft\n---\n# No Slug\n\n---\n\nChanged\n",
    );
  });

  test("refuses a deck without slides, as a body validation error", async () => {
    const opened = await store();
    const refusal = await opened.service
      .createEntityFromMarkdown({
        input: {
          entityType: "deck",
          id: "flat",
          markdown: "---\ntitle: Flat\nstatus: draft\n---\nOne slide only\n",
        },
      })
      .then(
        () => "stored",
        (error: unknown) => String(error),
      );
    expect(refusal).toContain("slide separators");
    expect(await opened.stored("deck", "flat")).toBeNull();
  });

  test("stores system_generate's stub as the deck adapter built it", async () => {
    const opened = await store();
    const adapter = opened.shell.getEntityRegistry().getAdapter("deck");
    const stub = adapter.buildStub?.({ id: "stubbed", title: "Stubbed" });
    if (!stub) throw new Error("The deck builds no stub");
    await opened.service.createEntity({
      entity: { id: "stubbed", entityType: "deck", ...stub },
    });
    expect((await opened.stored("deck", "stubbed"))?.content).toBe(
      "---\ntitle: Stubbed\nslug: stubbed\nstatus: generating\n---\n# Stubbed\n\n---\n",
    );
  });
});

describe("a deck written whole, as an editor writes it", () => {
  test("is stored as the deck adapter wrote it, its frontmatter laid over its fields", async () => {
    const opened = await store();
    await imported(opened, "full", full);
    const read = await opened.service.getEntity({
      entityType: "deck",
      id: "full",
    });
    if (!read) throw new Error("Missing deck");
    await opened.service.updateEntity({
      entity: { ...read, content: full.replace("Body", "Changed") },
    });
    expect((await opened.stored("deck", "full"))?.content).toBe(
      full.replace("Body", "Changed"),
    );
  });

  test("keeps frontmatter the deck does not write, as the adapter kept it", async () => {
    const opened = await store();
    const tagged = full.replace(
      "status: draft\n",
      "status: draft\ntags: tides\n",
    );
    const stored = await imported(opened, "tagged", tagged);
    expect(stored).toBe(
      "---\ntitle: Tidal Systems\nslug: tidal-systems\ndescription: How tides move\nauthor: Ada\nstatus: draft\nevent: Harbour Conf\ncoverImageId: tide-cover\ntags: tides\n---\n# Tidal Systems\n\n---\n\n## Second\n\nBody\n",
    );
    const read = await opened.service.getEntity({
      entityType: "deck",
      id: "tagged",
    });
    if (!read) throw new Error("Missing deck");
    await opened.service.updateEntity({
      entity: { ...read, content: read.content.replace("Body", "Changed") },
    });
    expect((await opened.stored("deck", "tagged"))?.content).toBe(
      stored?.replace("Body", "Changed"),
    );
  });
});

describe("the decks data source on the entity store", () => {
  const listSchema = z.object({ decks: z.array(deckViewSchema) });
  const detailSchema = z.object({
    markdown: z.string(),
    deck: deckWithDataSchema,
  });

  test("lists a deck as the class read it: its document, fields, frontmatter and slides", async () => {
    const opened = await store();
    await imported(opened, "full", full);
    const listed = await opened.fetchData("decks:entities", {}, listSchema, {
      entityService: scopeEntityReads(opened.service, {
        visibilityScope: "public",
      }),
    });
    const [deck] = listed.decks;
    expect(deck?.content).toBe(full);
    expect(deck?.metadata).toEqual({
      title: "Tidal Systems",
      description: "How tides move",
      status: "draft",
      publishedAt: null,
      coverImageId: "tide-cover",
      slug: "tidal-systems",
      error: null,
    });
    expect(deck?.frontmatter).toEqual({
      title: "Tidal Systems",
      slug: "tidal-systems",
      description: "How tides move",
      author: "Ada",
      status: "draft",
      publishedAt: null,
      event: "Harbour Conf",
      coverImageId: "tide-cover",
      ogImageId: null,
    });
    expect(deck?.body).toBe("# Tidal Systems\n\n---\n\n## Second\n\nBody");
  });

  test("shows one deck by its slug, its cover on the first slide", async () => {
    const opened = await store();
    await imported(opened, "full", full);
    await opened.service.createEntity({
      entity: {
        id: "tide-cover",
        entityType: "image",
        content: "data:image/png;base64,AAAA",
        metadata: {
          title: "Tide",
          alt: "Tide",
          format: "png",
          width: 1,
          height: 1,
        },
      },
    });
    const shown = await opened.fetchData(
      "decks:entities",
      { query: { id: "tidal-systems" } },
      detailSchema,
      {
        entityService: scopeEntityReads(opened.service, {
          visibilityScope: "public",
        }),
      },
    );
    expect(shown.markdown).toBe(
      '<!-- .slide: data-background-image="data:image/png;base64,AAAA" data-background-opacity="0.4" -->\n# Tidal Systems\n\n---\n\n## Second\n\nBody',
    );
    expect(shown.deck.id).toBe("full");
  });
});

describe("a site reading a declared deck", () => {
  test("parses its frontmatter and slides out of the record", async () => {
    const opened = await store();
    await imported(opened, "full", full);
    const read = await opened.service.getEntity(
      { entityType: "deck", id: "full" },
      deckSchema,
    );
    if (!read) throw new Error("Missing deck");
    const parsed = parseDeckData(read);
    expect(parsed.frontmatter).toEqual({
      title: "Tidal Systems",
      slug: "tidal-systems",
      description: "How tides move",
      author: "Ada",
      status: "draft",
      event: "Harbour Conf",
      coverImageId: "tide-cover",
    });
    expect(parsed.body).toBe("# Tidal Systems\n\n---\n\n## Second\n\nBody");
  });
});

describe("the declared deck generation on the entity store", () => {
  test("writes a deck from its given slides as the class handler did", async () => {
    const opened = await store();
    expect(
      await generate(opened, {
        title: "Given Deck",
        content: "# Given\n\n---\n\nSlide",
        description: "Given desc",
        author: "Ada",
        event: "Conf",
      }),
    ).toEqual({
      success: true,
      entityId: "Given Deck",
      title: "Given Deck",
      slug: "given-deck",
    });
    expect((await opened.stored("deck", "Given Deck"))?.content).toBe(
      "---\ntitle: Given Deck\nslug: given-deck\ndescription: Given desc\nauthor: Ada\nstatus: draft\nevent: Conf\n---\n# Given\n\n---\n\nSlide\n",
    );
  });

  test("fills the stub it was given, and marks a failed one", async () => {
    const opened = await store();
    const adapter = opened.shell.getEntityRegistry().getAdapter("deck");
    for (const [id, title] of [
      ["alloc", "Alloc"],
      ["doomed", "Doomed"],
    ] as const) {
      const stub = adapter.buildStub?.({ id, title });
      if (!stub) throw new Error("The deck builds no stub");
      await opened.service.createEntity({
        entity: { id, entityType: "deck", ...stub },
      });
    }

    expect(
      await generate(opened, {
        title: "Alloc",
        content: "# Alloc\n\n---\n\nS",
        description: "D",
        entityId: "alloc",
      }),
    ).toEqual({
      success: true,
      entityId: "alloc",
      title: "Alloc",
      slug: "alloc",
    });
    expect((await opened.stored("deck", "alloc"))?.content).toBe(
      "---\ntitle: Alloc\nslug: alloc\ndescription: D\nstatus: draft\n---\n# Alloc\n\n---\n\nS\n",
    );

    expect(
      await generate(opened, { skipAi: true, entityId: "doomed" }),
    ).toEqual({
      success: false,
      error: "Title is required when skipAi is true",
    });
    expect((await opened.stored("deck", "doomed"))?.content).toBe(
      "---\ntitle: Doomed\nslug: doomed\nstatus: failed\nerror: Title is required when skipAi is true\n---\n# Doomed\n\n---\n",
    );
  });
});

describe("a deck from pasted text", () => {
  test("goes on to the ordinary create with the document the class built", async () => {
    const opened = await store();
    const intercept = opened.shell
      .getEntityRegistry()
      .getCreateInterceptor("deck");
    if (!intercept) throw new Error("No deck create route");
    expect(
      await intercept(
        {
          entityType: "deck",
          content: "# Pasted Deck\n\nIntro\n\n---\n\nSecond",
          fields: { description: "Pasted desc", event: "Meetup" },
        },
        {
          interfaceType: "cli",
          actor: { kind: "user", userId: "u" },
          userPermissionLevel: "admin",
        },
      ),
    ).toEqual({
      kind: "continue",
      input: {
        entityType: "deck",
        content:
          "---\ntitle: Pasted Deck\nstatus: draft\ndescription: Pasted desc\nevent: Meetup\n---\n# Pasted Deck\n\nIntro\n\n---\n\nSecond\n",
        title: "Pasted Deck",
      },
    });
  });
});
