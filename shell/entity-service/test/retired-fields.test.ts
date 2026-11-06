import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import { EntityRegistry } from "../src/entityRegistry";
import { EntitySerializer } from "../src/entity-serializer";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter";
import { baseEntitySchema, type BaseEntity } from "../src/types";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

// A strict owner: a stored key it no longer declares fails its parse.
const postFields = z.strictObject({ title: z.string() });
const postSchema = baseEntitySchema.extend({ metadata: postFields });
type Post = z.infer<typeof postSchema>;

class PostAdapter extends BaseEntityAdapter<Post, Post["metadata"]> {
  private readonly fields: z.ZodObject<{ title: z.ZodString }>;
  constructor(fields: z.ZodObject<{ title: z.ZodString }> = postFields) {
    super({
      entityType: "post",
      purpose: "Retired-field fixture",
      schema: postSchema,
      frontmatterSchema: fields,
    });
    this.fields = fields;
  }
  fromMarkdown(content: string): Partial<Post> {
    return { content, metadata: this.parseFrontMatter(content, this.fields) };
  }
}

/** A loose owner keeps keys it does not claim, such as a grouping. */
const looseFields = z.object({ title: z.string() });

const RETIRED = { retiredFields: ["ogDescription", "twitterCard"] };

function storedBeforeRetirement(extra = ""): string {
  return `---\ntitle: Hello\nogDescription: Old summary\ntwitterCard: summary\n${extra}---\n\nBody\n`;
}

function fields(content: string): Record<string, unknown> {
  return parseMarkdownWithFrontmatter(
    content,
    z.record(z.string(), z.unknown()),
  ).metadata;
}

function post(content: string, metadata: Record<string, unknown>): BaseEntity {
  return {
    id: "hello",
    entityType: "post",
    content,
    metadata,
    contentHash: "fixture",
    visibility: "public",
    created: "2026-10-20T00:00:00.000Z",
    updated: "2026-10-20T00:00:00.000Z",
  };
}

function setup(fields = postFields): {
  registry: EntityRegistry;
  serializer: EntitySerializer;
} {
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType(
    "post",
    postSchema,
    new PostAdapter(fields),
    RETIRED,
  );
  return { registry, serializer: new EntitySerializer(registry, logger) };
}

describe("retired frontmatter fields", () => {
  it("read a file stored before retirement, even under a strict schema", () => {
    const { serializer } = setup();
    expect(
      serializer.deserializeEntity(storedBeforeRetirement(), "post").metadata,
    ).toEqual({ title: "Hello" });
  });

  it("are never written back, while other unclaimed fields are kept", () => {
    const { serializer } = setup(looseFields);
    const entity = post(storedBeforeRetirement("unclaimed: keep\n"), {
      title: "Hello",
      ogDescription: "Old summary",
    });

    const stored = serializer.prepareEntityForStorage(entity, "post");
    expect(fields(stored.markdown)).toEqual({
      title: "Hello",
      unclaimed: "keep",
    });
    expect(stored.metadata).toEqual({ title: "Hello" });
    expect(fields(serializer.serializeEntity(entity))).toEqual({
      title: "Hello",
      unclaimed: "keep",
    });
  });

  it("change nothing for a file that carries none of them", () => {
    const { serializer } = setup(looseFields);
    const logger = createSilentLogger();
    const plain = EntityRegistry.createFresh(logger);
    plain.registerEntityType("post", postSchema, new PostAdapter(looseFields));
    const entity = post("---\ntitle: Hello\nunclaimed: keep\n---\n\nBody\n", {
      title: "Hello",
    });
    expect(serializer.serializeEntity(entity)).toBe(
      new EntitySerializer(plain, logger).serializeEntity(entity),
    );
  });
});

describe("registering retired fields", () => {
  it("refuses a field the type's metadata still declares", () => {
    const registry = EntityRegistry.createFresh(createSilentLogger());
    expect(() =>
      registry.registerEntityType("post", postSchema, new PostAdapter(), {
        retiredFields: ["title"],
      }),
    ).toThrow("post retires title, which its metadata schema still declares");
  });
});

describe("rewriting stored entities that still carry retired fields", () => {
  let context: EntityServiceTestContext | undefined;
  afterEach(async () => {
    await context?.cleanup();
    context = undefined;
  });

  it("rewrites each such entity once, and leaves the rest alone", async () => {
    context = await setupEntityService(
      [
        {
          name: "post",
          schema: postSchema,
          adapter: new PostAdapter(),
          config: RETIRED,
        },
      ],
      { embeddingsEnabled: false },
    );
    const service = context.entityService;
    await service.createEntity({
      entity: post("---\ntitle: Hello\n---\n\nBody\n", { title: "Hello" }),
    });
    await service.createEntity({
      entity: {
        ...post("---\ntitle: Clean\n---\n\nBody\n", { title: "Clean" }),
        id: "clean",
      },
    });
    // The row as an earlier release stored it.
    const db = new Database(fileURLToPath(context.dbConfig.url));
    db.query("UPDATE entities SET content = ?, metadata = ? WHERE id = ?").run(
      storedBeforeRetirement(),
      JSON.stringify({ title: "Hello", ogDescription: "Old summary" }),
      "hello",
    );
    db.close();

    expect(await service.rewriteRetiredFields()).toEqual({ rewritten: 1 });

    const rewritten = await service.getEntity({
      entityType: "post",
      id: "hello",
    });
    expect(fields(rewritten?.content ?? "")).toEqual({ title: "Hello" });
    expect(rewritten?.metadata).toEqual({ title: "Hello" });
    expect(await service.rewriteRetiredFields()).toEqual({ rewritten: 0 });
  });

  it("validates content without its retired fields", async () => {
    context = await setupEntityService(
      [
        {
          name: "post",
          schema: postSchema,
          adapter: new PostAdapter(),
          config: RETIRED,
        },
      ],
      { embeddingsEnabled: false },
    );
    // A validator that strictly parses the stored file, as mail items do.
    context.entityRegistry.registerPersistValidator("post", async (entity) => {
      parseMarkdownWithFrontmatter(entity.content, postFields);
    });
    const service = context.entityService;

    await service.createEntity({
      entity: post(storedBeforeRetirement(), { title: "Hello" }),
    });
    const created = await service.getEntity({
      entityType: "post",
      id: "hello",
    });
    expect(fields(created?.content ?? "")).toEqual({ title: "Hello" });

    const db = new Database(fileURLToPath(context.dbConfig.url));
    db.query(
      "UPDATE entities SET content = ?, contentHash = ? WHERE id = ?",
    ).run(
      storedBeforeRetirement(),
      computeContentHash(storedBeforeRetirement()),
      "hello",
    );
    db.close();
    expect(await service.rewriteRetiredFields()).toEqual({ rewritten: 1 });
  });
});

describe("retired nested fields", () => {
  // The owner's nested object is strict: an unknown key inside it fails.
  const mailFields = z.object({
    title: z.string(),
    source: z.strictObject({ ref: z.string() }),
  });
  const mailSchema = baseEntitySchema.extend({ metadata: mailFields });
  type Mail = z.infer<typeof mailSchema>;

  class MailAdapter extends BaseEntityAdapter<Mail, Mail["metadata"]> {
    constructor() {
      super({
        entityType: "mail",
        purpose: "Nested retired-field fixture",
        schema: mailSchema,
        frontmatterSchema: mailFields,
      });
    }
    fromMarkdown(content: string): Partial<Mail> {
      return { content, metadata: this.parseFrontMatter(content, mailFields) };
    }
  }

  const stored =
    "---\ntitle: Hello\nsource:\n  ref: imap:1\n  senderKey: abc123\n---\n\nBody\n";

  function mailSerializer(): EntitySerializer {
    const logger = createSilentLogger();
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType("mail", mailSchema, new MailAdapter(), {
      retiredFields: ["source.senderKey"],
    });
    return new EntitySerializer(registry, logger);
  }

  it("are read past inside their object", () => {
    expect(mailSerializer().deserializeEntity(stored, "mail").metadata).toEqual(
      { title: "Hello", source: { ref: "imap:1" } },
    );
  });

  it("are not written back, and the rest of the object stays", () => {
    const entity = {
      ...post(stored, {
        title: "Hello",
        source: { ref: "imap:1", senderKey: "abc123" },
      }),
      id: "mail-1",
      entityType: "mail",
    };
    const prepared = mailSerializer().prepareEntityForStorage(entity, "mail");

    expect(fields(prepared.markdown)).toEqual({
      title: "Hello",
      source: { ref: "imap:1" },
    });
    expect(prepared.metadata).toEqual({
      title: "Hello",
      source: { ref: "imap:1" },
    });
  });
});

describe("translated fields", () => {
  // An owner that still reads `heading`, its old name for `title`.
  class RenamingAdapter extends BaseEntityAdapter<Post, Post["metadata"]> {
    constructor() {
      super({
        entityType: "post",
        purpose: "Translated-field fixture",
        schema: postSchema,
        frontmatterSchema: looseFields,
      });
    }
    fromMarkdown(content: string): Partial<Post> {
      const stored = fields(content);
      return {
        content,
        metadata: { title: String(stored["title"] ?? stored["heading"]) },
      };
    }
  }

  const stored = "---\nheading: Hello\n---\n\nBody\n";
  const TRANSLATED = { translatedFields: ["heading"] };

  it("reach the parser, and are never written back", () => {
    const logger = createSilentLogger();
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType(
      "post",
      postSchema,
      new RenamingAdapter(),
      TRANSLATED,
    );
    const serializer = new EntitySerializer(registry, logger);

    const read = serializer.deserializeEntity(stored, "post");
    expect(read.metadata).toEqual({ title: "Hello" });
    const prepared = serializer.prepareEntityForStorage(
      post(stored, { title: "Hello", heading: "Hello" }),
      "post",
    );
    expect(fields(prepared.markdown)).toEqual({ title: "Hello" });
    expect(prepared.metadata).toEqual({ title: "Hello" });
  });

  let context: EntityServiceTestContext | undefined;
  afterEach(async () => {
    await context?.cleanup();
    context = undefined;
  });

  it("are rewritten on start into their new place", async () => {
    context = await setupEntityService(
      [
        {
          name: "post",
          schema: postSchema,
          adapter: new RenamingAdapter(),
          config: TRANSLATED,
        },
      ],
      { embeddingsEnabled: false },
    );
    const service = context.entityService;
    await service.createEntity({
      entity: post("---\ntitle: Hello\n---\n\nBody\n", { title: "Hello" }),
    });
    const db = new Database(fileURLToPath(context.dbConfig.url));
    // The row as an earlier release stored it, hash included.
    db.query(
      "UPDATE entities SET content = ?, contentHash = ? WHERE id = ?",
    ).run(stored, computeContentHash(stored), "hello");
    db.close();

    expect(await service.rewriteRetiredFields()).toEqual({ rewritten: 1 });
    const rewritten = await service.getEntity({
      entityType: "post",
      id: "hello",
    });
    expect(fields(rewritten?.content ?? "")).toEqual({ title: "Hello" });
  });
});
