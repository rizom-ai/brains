import { afterEach, describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import { EntityRegistry } from "../src/entityRegistry";
import { EntitySerializer } from "../src/entity-serializer";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "../src/frontmatter";
import { baseEntitySchema } from "../src/types";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

/**
 * A type whose metadata is its frontmatter and whose read is the stored
 * document as written, header included, as a saved agent contact is read:
 * a field update hands the read document back with only its metadata
 * changed, so the header in its content is the one storage holds.
 */

const contactFields = z.object({
  name: z.string(),
  status: z.enum(["discovered", "approved", "archived"]),
});
const contactSchema = baseEntitySchema.extend({ metadata: contactFields });
type Contact = z.infer<typeof contactSchema>;

class ContactAdapter extends BaseEntityAdapter<Contact, Contact["metadata"]> {
  public readonly metadataFromFrontmatter = true;

  constructor() {
    super({
      entityType: "contact",
      purpose: "Read-as-written fixture",
      schema: contactSchema,
      frontmatterSchema: contactFields,
    });
  }

  /** The header from metadata, over the body of the content handed in. */
  public override toMarkdown(entity: Contact): string {
    const body = parseMarkdownWithFrontmatter(
      entity.content,
      z.record(z.string(), z.unknown()),
    ).content;
    return generateMarkdownWithFrontmatter(body, entity.metadata);
  }

  /** The stored document byte for byte, metadata from its header. */
  fromMarkdown(markdown: string): Partial<Contact> {
    const parsed = parseMarkdownWithFrontmatter(markdown, contactFields);
    return { content: markdown, metadata: parsed.metadata };
  }

  public override extractMetadata(entity: Contact): Contact["metadata"] {
    return entity.metadata;
  }
}

const STORED =
  "---\nname: Old Agent\nstatus: discovered\n---\nA discovered peer.\n";

let context: EntityServiceTestContext | undefined;
afterEach(async () => {
  await context?.cleanup();
  context = undefined;
});

async function storedContact(): Promise<EntityServiceTestContext> {
  context = await setupEntityService([
    { name: "contact", schema: contactSchema, adapter: new ContactAdapter() },
  ]);
  await context.entityService.createEntity({
    entity: {
      id: "old-agent.example",
      entityType: "contact",
      content: STORED,
      metadata: { name: "Old Agent", status: "discovered" },
    },
  });
  return context;
}

describe("a field update to a type read as written", () => {
  it("persists the changed field the read document still states as stored", async () => {
    const { entityService } = await storedContact();
    const read = await entityService.getEntity({
      entityType: "contact",
      id: "old-agent.example",
    });
    if (!read) throw new Error("No contact");
    expect(read.content).toContain("status: discovered");

    const result = await entityService.updateEntity({
      entity: { ...read, metadata: { ...read.metadata, status: "approved" } },
      options: { expectedContentHash: read.contentHash },
    });

    expect(result.skipped).not.toBe(true);
    const after = await entityService.getEntity({
      entityType: "contact",
      id: "old-agent.example",
    });
    expect(after?.metadata["status"]).toBe("approved");
    expect(after?.content).toContain("status: approved");
  });

  it("still takes a header the caller rewrote over the metadata it read", async () => {
    const { entityService } = await storedContact();
    const read = await entityService.getEntity({
      entityType: "contact",
      id: "old-agent.example",
    });
    if (!read) throw new Error("No contact");

    await entityService.updateEntity({
      entity: {
        ...read,
        content: read.content.replace("status: discovered", "status: archived"),
      },
    });

    const after = await entityService.getEntity({
      entityType: "contact",
      id: "old-agent.example",
    });
    expect(after?.metadata["status"]).toBe("archived");
    expect(after?.content).toContain("status: archived");
  });
});

describe("the header fields an update writes", () => {
  function serializer(): EntitySerializer {
    const logger = createSilentLogger();
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType("contact", contactSchema, new ContactAdapter());
    return new EntitySerializer(registry, logger);
  }
  const archived = {
    id: "old-agent.example",
    entityType: "contact",
    content: STORED.replace("status: discovered", "status: archived"),
    metadata: { name: "Old Agent", status: "discovered" },
    visibility: "public" as const,
    created: "2026-03-14T10:00:00.000Z",
    updated: "2026-03-14T10:00:00.000Z",
    contentHash: "",
  };

  it("are those that differ from the stored header", () => {
    expect(
      serializer().withFrontmatterWrites(archived, STORED).metadata["status"],
    ).toBe("archived");
  });

  it("are every field when the stored header does not parse", () => {
    // A header kept as written for an editor to repair.
    const broken = "---\nname: [unterminated\n---\nA discovered peer.\n";
    expect(
      serializer().withFrontmatterWrites(archived, broken).metadata["status"],
    ).toBe("archived");
  });
});
