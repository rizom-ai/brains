import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { playbookSeedContract } from "@brains/contracts";
import { createServicePluginContext } from "@brains/plugins";
import playbooksPackage from "@brains/playbooks";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared playbook on the brain's own entity store, byte for byte as
 * main's playbook entity plugin class stored it (the bytes in
 * fixtures/playbook-main-bytes.json were captured from that class): a file
 * gains the three fields its schema defaults, its frontmatter is followed
 * directly by its body, and a body update, a directory-sync export and a
 * seed onboarding bundles store and export what the class stored and
 * exported, with the same metadata.
 */

const recordSchema = z.object({
  stored: z.string(),
  exported: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});
const fixtureSchema = z.object({
  handWritten: z.object({
    file: z.string(),
    imported: z.string(),
    bodyUpdate: z.object({ from: z.string(), to: z.string() }),
    updated: z.string(),
    exported: z.string(),
    metadata: z.record(z.string(), z.unknown()),
  }),
  seeds: z.object({
    onboarding: recordSchema,
    "first-knowledge-loop": recordSchema,
  }),
});

const main = fixtureSchema.parse(
  JSON.parse(
    await readFile(
      join(import.meta.dir, "fixtures", "playbook-main-bytes.json"),
      "utf8",
    ),
  ),
);

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    playbooksPackage,
    "@brains/playbooks",
    "playbooks",
    { projectionSource: false, projectionSourceRole: "excluded" },
  );
  stores.push(opened);
  return opened;
}

/** What directory sync writes for a record: its stored document, serialized. */
async function exported(
  opened: DeclaredEntityStore,
  id: string,
): Promise<string> {
  const entity = await opened.service.getEntity({
    entityType: "playbook",
    id,
    visibilityScope: "restricted",
    source: true,
  });
  if (!entity) throw new Error(`Missing playbook ${id}`);
  return opened.service.serializeEntity(entity);
}

describe("the declared playbook on the entity store", () => {
  test("stores a hand-written file as the class did, with its defaults stated", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "playbook",
        id: "hand-written",
        markdown: main.handWritten.file,
      },
    });

    expect((await opened.stored("playbook", "hand-written"))?.content).toBe(
      main.handWritten.imported,
    );
    const read = await opened.service.getEntity({
      entityType: "playbook",
      id: "hand-written",
    });
    expect(read?.metadata).toEqual(main.handWritten.metadata);
  });

  test("keeps the class's bytes through a body update and the export", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "playbook",
        id: "hand-written",
        markdown: main.handWritten.file,
      },
    });
    const read = await opened.service.getEntity({
      entityType: "playbook",
      id: "hand-written",
    });
    if (!read) throw new Error("Missing playbook");
    const { from, to } = main.handWritten.bodyUpdate;
    await opened.service.updateEntity({
      entity: { ...read, content: read.content.replace(from, to) },
    });

    expect((await opened.stored("playbook", "hand-written"))?.content).toBe(
      main.handWritten.updated,
    );
    expect(await exported(opened, "hand-written")).toBe(
      main.handWritten.exported,
    );
  });

  test("refuses a file whose body is not a playbook", async () => {
    const opened = await store();
    const refusal = await opened.service
      .createEntityFromMarkdown({
        input: {
          entityType: "playbook",
          id: "broken",
          markdown: "---\ntitle: Broken\n---\n\n## Steps\n\nNo steps here.\n",
        },
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toBeInstanceOf(Error);
    expect(await opened.stored("playbook", "broken")).toBeNull();
  });

  test.each(["onboarding", "first-knowledge-loop"] as const)(
    "seeds onboarding's %s playbook as the class stored and exported it",
    async (id) => {
      const opened = await store();
      const markdown = await readFile(
        join(
          import.meta.dir,
          "..",
          "..",
          "..",
          "plugins",
          "onboarding",
          "content",
          "playbook",
          `${id}.md`,
        ),
        "utf8",
      );
      const asker = createServicePluginContext(opened.shell, "onboarding");
      expect(
        await asker.messaging.request(playbookSeedContract, { id, markdown }),
      ).toEqual({ status: "answered", data: { created: true } });
      // A second seed finds it and writes nothing.
      expect(
        await asker.messaging.request(playbookSeedContract, { id, markdown }),
      ).toEqual({ status: "answered", data: { created: false } });

      const seeded = main.seeds[id];
      expect((await opened.stored("playbook", id))?.content).toBe(
        seeded.stored,
      );
      expect(await exported(opened, id)).toBe(seeded.exported);
      expect(
        (
          await opened.service.getEntity({
            entityType: "playbook",
            id,
            visibilityScope: "restricted",
          })
        )?.metadata,
      ).toEqual(seeded.metadata);
    },
  );
});
