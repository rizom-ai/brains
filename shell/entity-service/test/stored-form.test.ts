import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { createClient } from "@libsql/client";
import { computeContentHash } from "@brains/utils/hash";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import { EntityRegistry } from "../src/entityRegistry";
import { EntitySerializer } from "../src/entity-serializer";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "../src/frontmatter";
import { storedFormWrites } from "../src/stored-form";
import {
  baseEntitySchema,
  type EntityEventBus,
  type EntityTypeConfig,
} from "../src/types";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

/**
 * The form a stored document takes (docs/plans/one-stored-form.md): framed
 * the same on every path, in the order of the document it replaces, with
 * no default its author did not state, unknown keys kept, and stored rows
 * brought to that form by a quiet rewrite on start.
 */

const cardFields = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]).default("draft"),
  tags: z.array(z.string()).optional(),
  link: z.object({ label: z.string(), href: z.string().optional() }).optional(),
});
const cardSchema = baseEntitySchema.extend({ metadata: cardFields });
type Card = z.infer<typeof cardSchema>;

/** A declared type's adapter: its metadata is its frontmatter. */
class CardAdapter extends BaseEntityAdapter<Card, Card["metadata"]> {
  public readonly metadataFromFrontmatter = true;
  constructor() {
    super({
      entityType: "card",
      purpose: "Stored-form fixture",
      schema: cardSchema,
      frontmatterSchema: cardFields,
    });
  }
  public override toMarkdown(entity: Card): string {
    const body = parseMarkdownWithFrontmatter(
      entity.content,
      z.record(z.string(), z.unknown()),
    ).content;
    return generateMarkdownWithFrontmatter(body, entity.metadata);
  }
  fromMarkdown(markdown: string): Partial<Card> {
    const parsed = parseMarkdownWithFrontmatter(markdown, cardFields);
    return { content: parsed.content, metadata: parsed.metadata };
  }
  public override extractMetadata(entity: Card): Card["metadata"] {
    return entity.metadata;
  }
}

function card(content: string, metadata: Card["metadata"]): Card {
  return {
    id: "one",
    entityType: "card",
    content,
    metadata,
    contentHash: "fixture",
    visibility: "public",
    created: "2026-10-20T00:00:00.000Z",
    updated: "2026-10-20T00:00:00.000Z",
  };
}

function serializer(config: EntityTypeConfig = {}): EntitySerializer {
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("card", cardSchema, new CardAdapter(), config);
  return new EntitySerializer(registry, logger);
}

describe("the switch between the stored forms", () => {
  it("writes the new form from alpha W", () => {
    expect(storedFormWrites).toBe("new");
  });
});

describe("a stored document's framing", () => {
  it("puts the body under the header with one newline at its end", () => {
    const written = serializer().serializeEntity(
      card("---\ntitle: One\n---\n\n\nBody\n\n\n", {
        title: "One",
        status: "draft",
      }),
    );
    expect(written).toBe("---\ntitle: One\n---\nBody\n");
  });

  it("writes a document without a body as its header and one empty line", () => {
    expect(
      serializer().serializeEntity(
        card("---\ntitle: One\n---\n", { title: "One", status: "draft" }),
      ),
    ).toBe("---\ntitle: One\n---\n\n");
  });

  it("frames a document whatever path wrote it, and again the same", () => {
    const once = serializer().serializeEntity(
      card("Body\n\n", { title: "One", status: "draft" }),
    );
    expect(once).toBe("---\ntitle: One\n---\nBody\n");
    expect(
      serializer().serializeEntity(
        card(once, { title: "One", status: "draft" }),
      ),
    ).toBe(once);
  });
});

describe("a stored document's key order", () => {
  it("keeps the order of the document it replaces, for every type", () => {
    const written = serializer().serializeEntity(
      card("---\ntags:\n  - a\ntitle: One\n---\nBody\n", {
        title: "Two",
        status: "published",
        tags: ["a"],
      }),
    );
    expect(written).toBe(
      "---\ntags:\n  - a\ntitle: Two\nstatus: published\n---\nBody\n",
    );
  });
});

describe("a stored document's defaults", () => {
  it("writes no default the document did not state", () => {
    expect(
      serializer().serializeEntity(
        card("---\ntitle: One\n---\nBody\n", { title: "One", status: "draft" }),
      ),
    ).toBe("---\ntitle: One\n---\nBody\n");
  });

  it("keeps a default the document states", () => {
    expect(
      serializer().serializeEntity(
        card("---\ntitle: One\nstatus: draft\n---\nBody\n", {
          title: "One",
          status: "draft",
        }),
      ),
    ).toBe("---\ntitle: One\nstatus: draft\n---\nBody\n");
  });

  it("writes a value other than the default", () => {
    expect(
      serializer().serializeEntity(
        card("---\ntitle: One\n---\nBody\n", {
          title: "One",
          status: "published",
        }),
      ),
    ).toBe("---\ntitle: One\nstatus: published\n---\nBody\n");
  });
});

describe("a stored document's unknown keys", () => {
  const withNested =
    "---\ntitle: One\nlink:\n  label: Home\n  note: kept\npinned: true\n---\nBody\n";
  const metadata = {
    title: "One",
    status: "draft" as const,
    link: { label: "Home" },
  };

  it("keeps an unclaimed key one level inside an object the type owns", () => {
    expect(serializer().serializeEntity(card(withNested, metadata))).toBe(
      withNested,
    );
  });

  it("still drops a retired key inside an object", () => {
    expect(
      serializer({ retiredFields: ["link.note"] }).serializeEntity(
        card(withNested, metadata),
      ),
    ).toBe("---\ntitle: One\nlink:\n  label: Home\npinned: true\n---\nBody\n");
  });

  it("names every key the type does not name", () => {
    expect(serializer().unknownFrontmatterKeys(withNested, "card")).toEqual([
      "link.note",
      "pinned",
    ]);
  });

  it("names none for a document of its own keys", () => {
    expect(
      serializer().unknownFrontmatterKeys(
        "---\ntitle: One\nvisibility: restricted\n---\nBody\n",
        "card",
      ),
    ).toEqual([]);
  });
});

describe("the quiet rewrite of stored rows", () => {
  let ctx: EntityServiceTestContext | undefined;
  afterEach(async () => {
    await ctx?.cleanup();
    ctx = undefined;
  });

  function capturingBus(): { bus: EntityEventBus; events: string[] } {
    const events: string[] = [];
    return {
      events,
      bus: {
        send: async (request): Promise<{ success: true }> => {
          events.push(request.type);
          return { success: true };
        },
      },
    };
  }

  async function opened(
    options: {
      embeddable?: boolean;
      bus?: EntityEventBus;
      adapter?: CardAdapter;
      storedForm?: "old" | "new";
    } = {},
  ): Promise<EntityServiceTestContext> {
    ctx = await setupEntityService(
      [
        {
          name: "card",
          schema: cardSchema,
          adapter: options.adapter ?? new CardAdapter(),
          config: { embeddable: options.embeddable ?? false },
        },
      ],
      {
        embeddingsEnabled: options.embeddable ?? false,
        ...(options.bus && { messageBus: options.bus }),
        ...(options.storedForm && { storedForm: options.storedForm }),
      },
    );
    await ctx.entityService.initialize();
    return ctx;
  }

  /** Store a row as an earlier release wrote it, last written long ago. */
  async function storedAsBefore(
    context: EntityServiceTestContext,
    content: string,
    metadata: Card["metadata"] = { title: "One", status: "draft" },
  ): Promise<void> {
    await context.entityService.createEntity({
      entity: {
        id: "one",
        entityType: "card",
        content: "Body",
        metadata,
        visibility: "public",
      },
    });
    const db = createClient({ url: context.dbConfig.url });
    await db.execute({
      sql: "UPDATE entities SET content = ?, contentHash = ?, updated = ? WHERE entityType = 'card' AND id = 'one'",
      args: [content, computeContentHash(content), Date.UTC(2026, 0, 1)],
    });
    await db.execute("DELETE FROM entity_export_intents");
    db.close();
  }

  async function row(
    context: EntityServiceTestContext,
  ): Promise<{ content: string; contentHash: string; updated: number }> {
    const db = createClient({ url: context.dbConfig.url });
    const result = await db.execute(
      "SELECT content, contentHash, updated FROM entities WHERE entityType = 'card' AND id = 'one'",
    );
    db.close();
    const first = result.rows[0];
    if (!first) throw new Error("No row");
    return {
      content: String(first["content"]),
      contentHash: String(first["contentHash"]),
      updated: Number(first["updated"]),
    };
  }

  const before = "---\ntitle: One\nstatus: draft\n---\n\nBody\n\n";
  const canonical = "---\ntitle: One\nstatus: draft\n---\nBody\n";

  it("stores the canonical form, keeping when it was last written", async () => {
    const context = await opened();
    await storedAsBefore(context, before);

    expect(await context.entityService.rewriteStoredForms()).toMatchObject({
      rewritten: 1,
      deferred: 0,
    });

    expect(await row(context)).toEqual({
      content: canonical,
      contentHash: computeContentHash(canonical),
      updated: Date.UTC(2026, 0, 1),
    });
  });

  it("sends no entity event and marks the row for export", async () => {
    const { bus, events } = capturingBus();
    const context = await opened({ bus });
    await storedAsBefore(context, before);
    events.splice(0);

    await context.entityService.rewriteStoredForms();

    expect(events).toEqual([]);
    expect(
      (await context.entityService.listPendingEntityExports()).map(
        ({ entityType, entityId, operation }) => ({
          entityType,
          entityId,
          operation,
        }),
      ),
    ).toEqual([{ entityType: "card", entityId: "one", operation: "upsert" }]);
  });

  it("rewrites nothing on a second start", async () => {
    const context = await opened();
    await storedAsBefore(context, before);
    await context.entityService.rewriteStoredForms();

    expect(await context.entityService.rewriteStoredForms()).toMatchObject({
      rewritten: 0,
      deferred: 0,
    });
  });

  it("leaves a row that does not decode as stored", async () => {
    const context = await opened();
    await storedAsBefore(context, "---\nstatus: nonsense\n---\nBody\n");

    expect(await context.entityService.rewriteStoredForms()).toMatchObject({
      rewritten: 0,
      deferred: 0,
    });
    expect((await row(context)).content).toBe(
      "---\nstatus: nonsense\n---\nBody\n",
    );
  });

  it("keeps the embedding when only the framing changed", async () => {
    const context = await opened({ embeddable: true });
    await storedAsBefore(context, before);
    await context.entityService.storeEmbedding({
      entityId: "one",
      entityType: "card",
      embedding: new Float32Array(1536),
      contentHash: computeContentHash(before),
    });
    const enqueue = spyOn(context.jobQueueService, "enqueue");
    enqueue.mockClear();

    await context.entityService.rewriteStoredForms();

    expect(enqueue).not.toHaveBeenCalled();
    const embeddings = createClient({ url: context.embeddingDbConfig.url });
    const embedded = await embeddings.execute(
      "SELECT content_hash FROM embeddings WHERE entity_type = 'card' AND entity_id = 'one'",
    );
    embeddings.close();
    expect(embedded.rows.map((found) => found["content_hash"])).toEqual([
      computeContentHash(canonical),
    ]);
  });

  it("re-embeds when the text it embeds changed", async () => {
    const context = await opened({
      embeddable: true,
      adapter: new MovedTagsAdapter(),
      storedForm: "new",
    });
    // Its tags were in the header; the type now writes them in the body.
    const oldForm = "---\ntitle: One\ntags:\n  - a\n---\nBody\n";
    await storedAsBefore(context, oldForm, {
      title: "One",
      status: "draft",
      tags: ["a"],
    });
    await context.entityService.storeEmbedding({
      entityId: "one",
      entityType: "card",
      embedding: new Float32Array(1536),
      contentHash: computeContentHash(oldForm),
    });
    const enqueue = spyOn(context.jobQueueService, "enqueue");
    enqueue.mockClear();

    await context.entityService.rewriteStoredForms();

    const moved = "---\ntitle: One\n---\nBody\n\nTags: a\n";
    expect((await row(context)).content).toBe(moved);
    expect(enqueue).toHaveBeenCalledTimes(1);
    // A restatement: what derives from the row's meaning is not redone.
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({
      data: {
        id: "one",
        entityType: "card",
        contentHash: computeContentHash(moved),
        restated: true,
      },
    });
  });

  it("reports each row it restates, with the hash it had and the one it has", async () => {
    const context = await opened();
    await storedAsBefore(context, before);

    expect((await context.entityService.rewriteStoredForms()).restated).toEqual(
      [
        {
          entityType: "card",
          entityId: "one",
          previousHash: computeContentHash(before),
          contentHash: computeContentHash(canonical),
        },
      ],
    );
  });
});

/**
 * A body a type's codec passes through, laid out by something outside it
 * (a site section's template), is restated by whoever lays it out: quietly,
 * as the rewrite on start writes.
 */
describe("restating an entity's body", () => {
  let ctx: EntityServiceTestContext | undefined;
  afterEach(async () => {
    await ctx?.cleanup();
    ctx = undefined;
  });

  async function opened(
    bus?: EntityEventBus,
  ): Promise<EntityServiceTestContext> {
    ctx = await setupEntityService(
      [
        {
          name: "card",
          schema: cardSchema,
          adapter: new CardAdapter(),
          config: { embeddable: false },
        },
      ],
      { embeddingsEnabled: false, ...(bus && { messageBus: bus }) },
    );
    await ctx.entityService.initialize();
    await ctx.entityService.createEntity({
      entity: {
        id: "one",
        entityType: "card",
        content: "Body",
        metadata: { title: "One", status: "draft" },
        visibility: "public",
      },
    });
    const db = createClient({ url: ctx.dbConfig.url });
    await db.execute("UPDATE entities SET updated = 1 WHERE id = 'one'");
    await db.execute("DELETE FROM entity_export_intents");
    db.close();
    return ctx;
  }

  it("writes the new body quietly and reports the row restated", async () => {
    const events: string[] = [];
    const context = await opened({
      send: async (request): Promise<{ success: true }> => {
        events.push(request.type);
        return { success: true };
      },
    });
    const before = await context.entityService.getEntityRaw({
      entityType: "card",
      id: "one",
      source: true,
    });

    events.splice(0);
    const restated = await context.entityService.restateEntity({
      entityType: "card",
      id: "one",
      body: "Body, laid out anew",
    });

    const after = await context.entityService.getEntityRaw({
      entityType: "card",
      id: "one",
      source: true,
    });
    expect(after?.content).toStartWith("---\ntitle: One\n");
    expect(after?.content).toEndWith("---\nBody, laid out anew\n");
    expect(restated).toEqual({
      entityType: "card",
      entityId: "one",
      previousHash: before?.contentHash ?? "",
      contentHash: after?.contentHash ?? "",
    });
    expect(after?.updated).toBe(before?.updated);
    expect(events).toEqual([]);
    expect(
      (await context.entityService.listPendingEntityExports()).map(
        ({ entityId }) => entityId,
      ),
    ).toEqual(["one"]);
  });

  it("restates nothing when the body is the one stored", async () => {
    const context = await opened();
    expect(
      await context.entityService.restateEntity({
        entityType: "card",
        id: "one",
        body: "Body",
      }),
    ).toBeNull();
    expect(await context.entityService.listPendingEntityExports()).toEqual([]);
  });
});

describe("the quiet rewrite while the old form is written", () => {
  let ctx: EntityServiceTestContext | undefined;
  afterEach(async () => {
    await ctx?.cleanup();
    ctx = undefined;
  });

  it("frames a row but leaves one that differs beyond its framing, and counts it", async () => {
    ctx = await setupEntityService(
      [{ name: "card", schema: cardSchema, adapter: new MovedTagsAdapter() }],
      { storedForm: "old" },
    );
    await ctx.entityService.initialize();
    const oldForm = "---\ntitle: One\ntags:\n  - a\n---\n\nBody\n";
    await ctx.entityService.createEntity({
      entity: {
        id: "one",
        entityType: "card",
        content: "Body",
        metadata: { title: "One", status: "draft", tags: ["a"] },
        visibility: "public",
      },
    });
    const db = createClient({ url: ctx.dbConfig.url });
    await db.execute({
      sql: "UPDATE entities SET content = ?, contentHash = ? WHERE id = 'one'",
      args: [oldForm, computeContentHash(oldForm)],
    });
    db.close();

    expect(await ctx.entityService.rewriteStoredForms()).toEqual({
      rewritten: 0,
      deferred: 1,
      restated: [],
    });
    const after = createClient({ url: ctx.dbConfig.url });
    const stored = await after.execute(
      "SELECT content FROM entities WHERE id = 'one'",
    );
    after.close();
    expect(stored.rows[0]?.["content"]).toBe(oldForm);
  });
});

/** A type that moved its tags from the header into the body. */
class MovedTagsAdapter extends CardAdapter {
  public override toMarkdown(entity: Card): string {
    const { tags, ...header } = entity.metadata;
    const body = MovedTagsAdapter.body(
      parseMarkdownWithFrontmatter(
        entity.content,
        z.record(z.string(), z.unknown()),
      ).content,
    ).text;
    return generateMarkdownWithFrontmatter(
      tags && tags.length > 0 ? `${body}\n\nTags: ${tags.join(", ")}` : body,
      header,
    );
  }
  public override fromMarkdown(markdown: string): Partial<Card> {
    const parsed = parseMarkdownWithFrontmatter(
      markdown,
      z.record(z.string(), z.unknown()),
    );
    const { text, tags } = MovedTagsAdapter.body(parsed.content);
    return {
      content: text,
      metadata: cardFields.parse({
        ...parsed.metadata,
        ...(tags && { tags }),
      }),
    };
  }
  private static body(content: string): { text: string; tags?: string[] } {
    const match = /\n*Tags: (.*)\s*$/u.exec(content);
    return match?.[1] === undefined
      ? { text: content.trim() }
      : {
          text: content.slice(0, match.index).trim(),
          tags: match[1].split(", "),
        };
  }
}

/**
 * A key a type's next stored form states in its body is never carried back
 * into its header, even when a frontmatter extension names it, as a profile
 * kind names an anchor profile's purpose (docs/plans/one-stored-form.md).
 */
class BodyTagsAdapter extends MovedTagsAdapter {
  public readonly bodyFieldKeys: readonly string[] = ["tags"];
}

describe("a key the next form states in the body", () => {
  it("is not carried back into the header by an extension that names it", async () => {
    const context = await setupEntityService(
      [{ name: "card", schema: cardSchema, adapter: new BodyTagsAdapter() }],
      { storedForm: "new" },
    );
    context.entityRegistry.extendFrontmatterSchema(
      "card",
      z.object({ tags: z.array(z.string()).optional() }),
    );
    await context.entityService.initialize();
    const file = "---\ntitle: One\ntags:\n  - a\n---\nBody\n";
    const read = context.entityService.deserializeEntity(file, "card");
    const written = context.entityService.serializeEntity({
      id: "one",
      entityType: "card",
      content: file,
      contentHash: "",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      visibility: "public",
      metadata: read.metadata ?? {},
    });
    expect(written).toBe("---\ntitle: One\n---\nBody\n\nTags: a\n");
    await context.cleanup();
  });
});
