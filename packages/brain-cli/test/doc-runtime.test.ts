import { afterEach, describe, expect, test } from "bun:test";
import docsPackage from "@brains/doc";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared doc on the brain's own entity store: a doc's file keeps the
 * slug it states, even one that equals its title's, and gains none it does
 * not state, so directory sync exports no noise.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(docsPackage, "@brains/doc", "docs", {
    projectionSourceRole: "primary",
    retiredFields: ["sourcePath"],
  });
  stores.push(opened);
  return opened;
}

async function updateBody(
  opened: DeclaredEntityStore,
  id: string,
  body: string,
): Promise<void> {
  const read = await opened.service.getEntity({ entityType: "doc", id });
  if (!read) throw new Error(`Missing doc ${id}`);
  await opened.service.updateEntity({ entity: { ...read, content: body } });
}

describe("the declared doc on the entity store", () => {
  test("keeps a stated slug that equals its title's through an update", async () => {
    const opened = await store();
    const authored =
      "---\ntitle: Getting Started\nsection: Start here\norder: 10\nslug: getting-started\n---\nHello.\n";
    await opened.service.createEntityFromMarkdown({
      input: { entityType: "doc", id: "getting-started", markdown: authored },
    });
    expect((await opened.stored("doc", "getting-started"))?.content).toBe(
      authored,
    );

    await updateBody(opened, "getting-started", "Hello again.\n");

    expect((await opened.stored("doc", "getting-started"))?.content).toBe(
      authored.replace("Hello.", "Hello again."),
    );
  });

  test("writes no slug a doc does not state", async () => {
    const opened = await store();
    const authored =
      "---\ntitle: Getting Started\nsection: Start here\norder: 10\n---\nHello.\n";
    await opened.service.createEntityFromMarkdown({
      input: { entityType: "doc", id: "getting-started", markdown: authored },
    });

    await updateBody(opened, "getting-started", "Hello again.\n");

    expect((await opened.stored("doc", "getting-started"))?.content).toBe(
      authored.replace("Hello.", "Hello again."),
    );
    expect(
      (
        await opened.service.getEntity({
          entityType: "doc",
          id: "getting-started",
        })
      )?.metadata["slug"],
    ).toBe("getting-started");
  });
});
