import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
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
});
