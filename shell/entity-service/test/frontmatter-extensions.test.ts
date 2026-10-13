import { afterEach, describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import { EntityRegistry } from "../src/entityRegistry";
import { EntitySerializer } from "../src/entity-serializer";
import { preserveSourceFrontmatter } from "../src/frontmatter-extensions";
import { baseEntitySchema, type BaseEntity } from "../src/types";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

const ownerFields = z.object({ title: z.string() });
const ownerSchema = baseEntitySchema.extend({ metadata: ownerFields });
type OwnedEntity = z.infer<typeof ownerSchema>;

// Models adapters which rebuild Markdown from their static owner schema.
class StrippingAdapter extends BaseEntityAdapter<
  OwnedEntity,
  OwnedEntity["metadata"]
> {
  constructor() {
    super({
      entityType: "entry",
      purpose: "Extension persistence fixture",
      schema: ownerSchema,
      frontmatterSchema: ownerFields,
    });
  }
  override toMarkdown(entity: OwnedEntity): string {
    return this.buildMarkdown(
      this.extractBody(entity.content),
      this.parseFrontMatter(entity.content, ownerFields),
    );
  }
  fromMarkdown(content: string): Partial<OwnedEntity> {
    return { content, metadata: this.parseFrontMatter(content, ownerFields) };
  }
}

function document(clients = "clients:\n  - Acme\n"): string {
  return `---\ntitle: Example\n${clients}unclaimed: keep\nnullable: null\n---\n\nBody`;
}
function entity(content = document()): BaseEntity {
  return {
    id: "entry",
    entityType: "entry",
    content,
    metadata: { title: "Example", clients: ["Stale"] },
    contentHash: "fixture",
    visibility: "public",
    created: "2026-09-17T00:00:00.000Z",
    updated: "2026-09-17T00:00:00.000Z",
  };
}
function fields(content: string): Record<string, unknown> {
  return parseMarkdownWithFrontmatter(
    content,
    z.record(z.string(), z.unknown()),
  ).metadata;
}
function setup(): { registry: EntityRegistry; serializer: EntitySerializer } {
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("entry", ownerSchema, new StrippingAdapter());
  registry.extendFrontmatterSchema(
    "entry",
    z.object({ clients: z.array(z.string()).optional() }),
  );
  return { registry, serializer: new EntitySerializer(registry, logger) };
}

describe("frontmatter extension persistence", () => {
  it("leaves raw Markdown byte-for-byte unchanged when the adapter already preserves its fields", () => {
    const source =
      "---\n# Authored comment\ntitle: 'Example'\nclients: [Acme]\nnullable: null\n---\n\nBody\n";
    expect(preserveSourceFrontmatter(source, source, ownerFields, [])).toBe(
      source,
    );
  });

  it("uses source for an owner-declared grouping field even when metadata is stale", () => {
    class GroupedAdapter extends BaseEntityAdapter<BaseEntity> {
      constructor() {
        super({
          entityType: "entry",
          purpose: "Owner-declared group fixture",
          schema: baseEntitySchema,
          frontmatterSchema: z.object({
            clients: z.array(z.string()).optional(),
          }),
        });
      }
      fromMarkdown(content: string): Partial<BaseEntity> {
        return { content };
      }
    }
    const logger = createSilentLogger();
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType(
      "entry",
      baseEntitySchema,
      new GroupedAdapter(),
    );
    registry.registerGrouping({
      key: "clients",
      label: "Clients",
      field: "clients",
      types: ["entry"],
    });
    const serializer = new EntitySerializer(registry, logger);
    expect(fields(serializer.serializeEntity(entity()))["clients"]).toEqual([
      "Acme",
    ]);
    expect(
      fields(serializer.serializeEntity(entity(document("")))),
    ).not.toHaveProperty("clients");
  });
  it("projects source values on deserialize and after stripping entity validation", () => {
    const { registry, serializer } = setup();
    expect(serializer.deserializeEntity(document(), "entry").metadata).toEqual({
      title: "Example",
      clients: ["Acme"],
    });
    expect(registry.validateEntity("entry", entity()).metadata).toEqual({
      title: "Example",
      clients: ["Acme"],
    });
  });
  it("preserves extension and unclaimed fields in storage and the independent export path", () => {
    const { registry, serializer } = setup();
    const validated = registry.validateEntity("entry", entity());
    const stored = serializer.prepareEntityForStorage(validated, "entry");
    expect(stored.metadata).toEqual({ title: "Example", clients: ["Acme"] });
    expect(fields(stored.markdown)).toEqual({
      title: "Example",
      clients: ["Acme"],
      unclaimed: "keep",
      nullable: null,
    });
    expect(
      fields(
        serializer.serializeEntity({ ...validated, visibility: "restricted" }),
      ),
    ).toEqual({
      title: "Example",
      clients: ["Acme"],
      unclaimed: "keep",
      nullable: null,
      visibility: "restricted",
    });
  });
  it("does not resurrect a removed extension from stale metadata", () => {
    const { registry, serializer } = setup();
    const validated = registry.validateEntity("entry", entity(document("")));
    expect(validated.metadata).toEqual({ title: "Example" });
    expect(
      serializer.prepareEntityForStorage(validated, "entry").metadata,
    ).toEqual({ title: "Example" });
    expect(fields(serializer.serializeEntity(validated))).not.toHaveProperty(
      "clients",
    );
  });
  it("preserves frontmatter after the extension is no longer registered", () => {
    const logger = createSilentLogger();
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType("entry", ownerSchema, new StrippingAdapter());
    const serializer = new EntitySerializer(registry, logger);
    const validated = registry.validateEntity("entry", entity());
    expect(validated.metadata).not.toHaveProperty("clients");
    expect(
      fields(serializer.prepareEntityForStorage(validated, "entry").markdown),
    ).toEqual(fields(document()));
    expect(fields(serializer.serializeEntity(validated))).toEqual(
      fields(document()),
    );
  });
  it("validates writes but exports malformed persisted fields without repairing them", () => {
    const { registry, serializer } = setup();
    const invalid = entity(document("clients: Acme\n"));
    expect(() => registry.validateEntity("entry", invalid)).toThrow();
    expect(() =>
      serializer.deserializeEntity(invalid.content, "entry"),
    ).toThrow();
    expect(fields(serializer.serializeEntity(invalid))["clients"]).toBe("Acme");
  });
  it("preserves extension refinements", () => {
    const { registry } = setup();
    registry.extendFrontmatterSchema(
      "entry",
      z
        .object({ codes: z.array(z.string()).optional() })
        .refine((value) => value.codes?.length !== 2, {
          message: "Two codes are not admitted",
        }),
    );
    expect(() =>
      registry.validateEntity("entry", entity(document("codes: [one, two]\n"))),
    ).toThrow("Two codes are not admitted");
  });
  it("does not carry system fields into preserved frontmatter", () => {
    const { serializer } = setup();
    const result = fields(
      serializer.serializeEntity(
        entity(
          document(
            "id: forged\nentityType: other\nupdated: fabricated\nvisibility: restricted\nclients: [Acme]\n",
          ),
        ),
      ),
    );
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("entityType");
    expect(result).not.toHaveProperty("updated");
    expect(result).not.toHaveProperty("visibility");
    expect(result["clients"]).toEqual(["Acme"]);
  });
});

describe("extension values through real persistence", () => {
  let context: EntityServiceTestContext | undefined;
  afterEach(async () => {
    await context?.cleanup();
  });
  it("survives create, typed read, update, export, and reimport without metadata-only authority", async () => {
    context = await setupEntityService(
      [{ name: "entry", schema: ownerSchema, adapter: new StrippingAdapter() }],
      { embeddingsEnabled: false },
    );
    context.entityRegistry.extendFrontmatterSchema(
      "entry",
      z.object({ clients: z.array(z.string()).optional() }),
    );
    const service = context.entityService;
    await service.createEntity({ entity: entity() });
    const read = await service.getEntity(
      { entityType: "entry", id: "entry" },
      ownerSchema,
    );
    expect(read).not.toBeNull();
    if (!read) throw new Error("Missing persisted fixture");
    expect(read.metadata).not.toHaveProperty("clients");
    expect(fields(read.content)["clients"]).toEqual(["Acme"]);
    await service.updateEntity({
      entity: { ...read, content: document("clients: [Beta, Gamma]\n") },
    });
    const updated = await service.getEntity({
      entityType: "entry",
      id: "entry",
    });
    if (!updated) throw new Error("Missing updated fixture");
    const exported = service.serializeEntity(updated);
    expect(fields(exported)["clients"]).toEqual(["Beta", "Gamma"]);
    expect(
      service.deserializeEntity(exported, "entry").metadata?.["clients"],
    ).toEqual(["Beta", "Gamma"]);
  });
});
