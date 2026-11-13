import { describe, expect, it } from "bun:test";
import type { BaseEntity, EntityAdapter } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  storedDocumentCodec,
  writesInDocumentOrder,
} from "../src";

/**
 * A first-party declared type whose read is its stored document and whose
 * metadata is derived from part of its header, as an entity plugin class
 * kept one: the header holds what the type records, metadata indexes only
 * what is derived from it, a read hands back the whole document, and a
 * write states the header fields metadata names and keeps the rest of the
 * header once, in the document's order. Mail items and traffic snapshots
 * are stored this way.
 */

const header = z.object({
  title: z.string(),
  status: z.enum(["new", "done"]),
  source: z.object({ ref: z.string() }),
});

const ticket = writesInDocumentOrder(
  defineEntity({
    type: "ticket",
    purpose: "A record whose metadata indexes part of its header.",
    metadata: z.object({ title: z.string(), status: z.enum(["new", "done"]) }),
    markdown: storedDocumentCodec({
      header,
      deriveMetadata: (parsed) => ({
        title: parsed.title,
        status: parsed.status,
      }),
    }),
  }),
);

const document =
  "---\ntitle: First\nstatus: new\nsource:\n  ref: private-locator\n---\nThe summary.\n";

async function store(): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness();
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "tickets", entities: [ticket] }),
    {},
    { name: "@fixture/tickets", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  return harness;
}

describe("a stored-document codec", () => {
  it("reads the whole document and derives metadata from its header", async () => {
    const harness = await store();
    const entities = harness.getEntityService();
    await entities.createEntity({
      entity: {
        id: "first",
        entityType: "ticket",
        content: document,
        metadata: { title: "First", status: "new" },
      },
    });

    const read = await entities.getEntity({
      entityType: "ticket",
      id: "first",
    });
    expect(read?.content).toBe(
      "---\ntitle: First\nstatus: new\nsource:\n  ref: private-locator\n---\nThe summary.\n",
    );
    // Only what is derived; the header's source stays out of metadata.
    expect(read?.metadata).toEqual({ title: "First", status: "new" });
  });

  it("writes the header once, in the document's order", async () => {
    const harness = await store();
    const entities = harness.getEntityService();
    await entities.createEntity({
      entity: {
        id: "first",
        entityType: "ticket",
        content: document,
        metadata: { title: "First", status: "new" },
      },
    });
    const read = await entities.getEntity({
      entityType: "ticket",
      id: "first",
    });
    if (!read) throw new Error("No ticket");

    await entities.updateEntity({
      entity: {
        ...read,
        content: read.content.replace("status: new", "status: done"),
        metadata: { ...read.metadata, status: "done" },
      },
    });

    const stored = await entities.getEntity({
      entityType: "ticket",
      id: "first",
      source: true,
    });
    expect(stored?.content).toBe(
      "---\ntitle: First\nstatus: done\nsource:\n  ref: private-locator\n---\nThe summary.\n",
    );
    expect(stored?.content.split("source:")).toHaveLength(2);
    expect(stored?.metadata).toEqual({ title: "First", status: "done" });
  });

  it("refuses a header its schema refuses", async () => {
    const harness = await store();
    const created = await harness
      .getEntityService()
      .createEntity({
        entity: {
          id: "broken",
          entityType: "ticket",
          content: "---\ntitle: Broken\nstatus: lost\n---\nNo source.\n",
          metadata: { title: "Broken", status: "new" },
        },
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    const read = await harness
      .getEntityService()
      .getEntity({ entityType: "ticket", id: "broken" });
    // A document the header schema refuses never reads back as a record.
    expect(created === undefined ? read : null).toBeNull();
  });
});

/**
 * A stored document read as written, as Grouping definitions' class read
 * its one document: the read is the stored bytes, header and visibility
 * included, and a header that does not parse still reads, so an editor can
 * show it for repair.
 */
const settings = writesInDocumentOrder(
  defineEntity({
    type: "settings",
    purpose: "One document an admin writes and repairs by hand.",
    metadata: z.object({}),
    singleton: true,
    hasBody: false,
    markdown: storedDocumentCodec({
      header: z.looseObject({}),
      deriveMetadata: () => ({}),
      readAsWritten: true,
    }),
  }),
);

function settingsAdapter(): EntityAdapter<BaseEntity> {
  const [plugin] = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "settings", entities: [settings] }),
    {},
    { name: "@fixture/settings", version: "0.1.0" },
  );
  if (!(plugin instanceof EntityPlugin)) throw new Error("No settings plugin");
  return plugin.adapter;
}

describe("a stored-document codec read as written", () => {
  it("reads a header that does not parse, as written, with no metadata", () => {
    const broken = "---\nareas: [unterminated\n---\n";
    expect(settingsAdapter().fromMarkdown(broken)).toEqual({
      id: "settings",
      content: broken,
      metadata: {},
    });
  });

  it("reads a document as written, byte for byte", () => {
    const written =
      "---\nvisibility: shared\nareas:\n  clients:\n    excludeTypes: [gone]\n---\n";
    expect(settingsAdapter().fromMarkdown(written).content).toBe(written);
  });

  it("round-trips a written document byte for byte", async () => {
    const harness = createPluginHarness();
    for (const plugin of instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "settings", entities: [settings] }),
      {},
      { name: "@fixture/settings", version: "0.1.0" },
    )) {
      await harness.installPlugin(plugin);
    }
    const entities = harness.getEntityService();
    const written = "---\nareas:\n  clients:\n    label: Clients\n---\n";
    await entities.createEntity({
      entity: {
        id: "settings",
        entityType: "settings",
        content: written,
        metadata: {},
      },
    });
    const stored = await entities.getEntity({
      entityType: "settings",
      id: "settings",
      source: true,
    });
    if (!stored) throw new Error("No settings");
    const read = await entities.getEntity({
      entityType: "settings",
      id: "settings",
    });
    expect(read?.content).toBe(stored.content);
    expect(read?.metadata).toEqual({});
  });
});

describe("a stored-document codec that prepares its document", () => {
  const titled = z.object({ title: z.string() });
  const prepared = storedDocumentCodec<typeof titled, typeof titled>({
    header: titled,
    deriveMetadata: ({ title }) => ({ title }),
    readAsWritten: true,
    // Its class wrote the body from the line under its header.
    prepare: (stored) => ({
      ...stored,
      content: stored.content.replace(/^\n+/u, ""),
    }),
  });

  it("decodes what prepare hands on", () => {
    expect(
      prepared.decode({
        content: "\n\nThe body.",
        frontmatter: { title: "First" },
      }),
    ).toEqual({
      content: "---\ntitle: First\n---\nThe body.\n",
      metadata: { title: "First" },
    });
  });

  it("still reads as written, as the codec it is", () => {
    const [plugin] = instantiatePluginPackageDefinition(
      defineEntityPackage({
        id: "prepared",
        entities: [
          defineEntity({
            type: "prepared",
            purpose: "A record read as written.",
            metadata: z.object({ title: z.string() }),
            markdown: prepared,
          }),
        ],
      }),
      {},
      { name: "@fixture/prepared", version: "0.1.0" },
    );
    if (!(plugin instanceof EntityPlugin)) throw new Error("No plugin");
    const written = "---\ntitle: First\n---\n\nThe body.\n";
    const adapter: EntityAdapter<BaseEntity> = plugin.adapter;
    expect(adapter.fromMarkdown(written).content).toBe(written);
  });
});

describe("a stored-document codec with its own write", () => {
  it("encodes through the write it is given", () => {
    const titled = z.object({ title: z.string() });
    const codec = storedDocumentCodec<typeof titled, typeof titled>({
      header: titled,
      deriveMetadata: ({ title }) => ({ title }),
      encode: ({ content, metadata }) => ({
        content: content.toUpperCase(),
        frontmatter: { title: metadata.title, written: true },
      }),
    });
    expect(
      codec.encode?.({ content: "body", metadata: { title: "First" } }),
    ).toEqual({
      content: "BODY",
      frontmatter: { title: "First", written: true },
    });
  });
});
