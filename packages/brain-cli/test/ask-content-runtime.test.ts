import { afterEach, describe, expect, test } from "bun:test";
import askContentPackage, { createAskContent } from "@brains/ask-content";
import { askContentFromRecord } from "@brains/contracts";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared Ask copy on the brain's own entity store: an authored file
 * stored as the class stored it, and a copy the class wrote, whose fields
 * lived in its content and whose metadata was empty, read once reconciled.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    askContentPackage,
    "@brains/ask-content",
    "ask-content",
    { embeddable: false },
  );
  stores.push(opened);
  return opened;
}

const authored = createAskContent(
  { title: "Ask us", topics: ["Tides"] },
  "Welcome.",
);

async function publicCopy(store: DeclaredEntityStore): Promise<unknown> {
  const entity = await store.service.getEntity({
    entityType: "ask-content",
    id: "ask-content",
  });
  return entity ? askContentFromRecord(entity) : null;
}

describe("the declared Ask copy on the entity store", () => {
  test("stores an authored file as written and reads its copy", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "ask-content",
        id: "ask-content",
        markdown: authored,
      },
    });

    expect((await opened.stored("ask-content", "ask-content"))?.content).toBe(
      authored,
    );
    expect(await publicCopy(opened)).toEqual({
      title: "Ask us",
      topics: ["Tides"],
      introduction: "Welcome.",
    });
  });

  test("reads a copy the class wrote once its metadata is reconciled", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "ask-content",
        id: "ask-content",
        markdown: authored,
      },
    });
    await opened.rewrite("ask-content", "ask-content", authored, "{}");

    expect(await opened.service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 1,
    });

    const entity = await opened.service.getEntity({
      entityType: "ask-content",
      id: "ask-content",
    });
    expect(entity?.metadata).toEqual({ title: "Ask us", topics: ["Tides"] });
    expect(await publicCopy(opened)).toEqual({
      title: "Ask us",
      topics: ["Tides"],
      introduction: "Welcome.",
    });
  });
});
