import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { EntityService } from "@brains/entity-service";
import { createTestDirectory } from "@brains/test-utils";
import { faqAdapter, faqMetadata } from "../src/adapters/faq-adapter";
import {
  openFoldStorage,
  readFold,
  reconcileFold,
  seedFold,
} from "./helpers/fold-storage";

describe("FAQ reconciliation with atomic SQLite folding", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let service: EntityService;
  beforeEach(async () => {
    directory = await createTestDirectory("faq-fold");
    service = await openFoldStorage(directory.dir);
    await seedFold(service);
  });
  afterEach(async () => {
    service.close();
    await directory.cleanup();
  });

  it.each(["source", "target"])(
    "preserves both when %s is published concurrently",
    async (id) => {
      const fold = service.foldEntity.bind(service);
      spyOn(service, "foldEntity").mockImplementationOnce(async (request) => {
        const current = await readFold(service, id);
        if (!current) throw new Error("Missing fixture");
        const parsed = faqAdapter.parseFaqContent(current.content);
        const fields = { ...parsed.frontmatter, status: "published" as const };
        await service.updateEntity({
          entity: {
            ...current,
            visibility: "public",
            content: faqAdapter.createFaqContent(
              fields,
              parsed.answer,
              parsed.alternatives,
            ),
            metadata: faqMetadata(fields),
          },
        });
        return fold(request);
      });
      expect(await reconcileFold(service)).toEqual({ outcome: "changed" });
      expect((await readFold(service, "source"))?.metadata.asked).toBe(2);
      expect((await readFold(service, "target"))?.metadata.asked).toBe(3);
      const published = await service.getEntity({
        entityType: "faq",
        id,
        visibilityScope: "public",
        publishedOnly: true,
      });
      expect(published).not.toBeNull();
      if (id === "target")
        expect(published?.content).not.toContain("Answer source");
    },
  );

  it("rechecks the matched question when obtaining the target write snapshot", async () => {
    const getSnapshot = service.getEntityWriteSnapshot.bind(service);
    spyOn(service, "getEntityWriteSnapshot").mockImplementation(
      async (request) => {
        if (request.id === "target") {
          const target = await readFold(service, "target");
          if (!target) throw new Error("Missing target");
          const fields = {
            ...target.metadata,
            question: "A different question?",
          };
          await service.updateEntity({
            entity: {
              ...target,
              content: faqAdapter.createFaqContent(fields, "Different answer"),
              metadata: faqMetadata(fields),
            },
          });
        }
        return getSnapshot(request);
      },
    );
    expect(await reconcileFold(service)).toEqual({ outcome: "changed" });
    expect((await readFold(service, "source"))?.metadata.asked).toBe(2);
    expect((await readFold(service, "target"))?.metadata.question).toBe(
      "A different question?",
    );
  });

  it("retries a same-question target edit without losing its answer or double-counting", async () => {
    const fold = service.foldEntity.bind(service);
    spyOn(service, "foldEntity").mockImplementationOnce(async (request) => {
      const target = await readFold(service, "target");
      if (!target) throw new Error("Missing target");
      const fields = { ...target.metadata, asked: 5 };
      await service.updateEntity({
        entity: {
          ...target,
          content: faqAdapter.createFaqContent(fields, "Edited answer"),
          metadata: faqMetadata(fields),
        },
      });
      return fold(request);
    });
    expect(await reconcileFold(service)).toEqual({
      outcome: "folded",
      into: "target",
    });
    expect(await readFold(service, "source")).toBeNull();
    const target = await readFold(service, "target");
    expect(target?.metadata.asked).toBe(7);
    expect(faqAdapter.parseFaqContent(target?.content ?? "")).toMatchObject({
      answer: "Edited answer",
      alternatives: [{ answer: "Answer source" }],
    });
  });

  it("leaves an unchanged source retryable when target contention exhausts the bound", async () => {
    const fold = service.foldEntity.bind(service);
    const contended = spyOn(service, "foldEntity").mockImplementation(
      async (request) => {
        const target = await readFold(service, "target");
        if (!target) throw new Error("Missing target");
        const fields = { ...target.metadata, asked: target.metadata.asked + 1 };
        await service.updateEntity({
          entity: {
            ...target,
            content: faqAdapter.createFaqContent(fields, "Concurrent answer"),
            metadata: faqMetadata(fields),
          },
        });
        return fold(request);
      },
    );
    const failure = await reconcileFold(service).catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({
      message: "FAQ target kept changing during fold",
    });
    expect(contended).toHaveBeenCalledTimes(3);
    expect((await readFold(service, "source"))?.metadata.asked).toBe(2);
    expect((await readFold(service, "target"))?.metadata.asked).toBe(6);
    contended.mockRestore();
    expect(await reconcileFold(service)).toEqual({
      outcome: "folded",
      into: "target",
    });
    expect((await readFold(service, "target"))?.metadata.asked).toBe(8);
  });

  it("does not resurrect a source after an observed post-commit failure", async () => {
    const fold = service.foldEntity.bind(service);
    spyOn(service, "foldEntity").mockImplementationOnce(async (request) => {
      await fold(request);
      throw new Error("Lost acknowledgement after commit");
    });
    expect(
      await reconcileFold(service).catch((error: unknown) => error),
    ).toMatchObject({ message: "Lost acknowledgement after commit" });
    expect(await readFold(service, "source")).toBeNull();
    expect((await readFold(service, "target"))?.metadata.asked).toBe(5);
    expect(await reconcileFold(service)).toEqual({ outcome: "gone" });
    expect((await readFold(service, "target"))?.metadata.asked).toBe(5);
  });

  it("retries a refused write without restore or double-counting", async () => {
    const before = await readFold(service, "source");
    const fold = service.foldEntity.bind(service);
    spyOn(service, "foldEntity").mockImplementationOnce((request) =>
      fold({
        ...request,
        options: {
          beforeWrite: async () => {
            throw new Error("Write refused");
          },
        },
      }),
    );
    expect(
      await reconcileFold(service).catch((error: unknown) => error),
    ).toMatchObject({ message: "Write refused" });
    expect(await readFold(service, "source")).toEqual(before);
    expect((await readFold(service, "target"))?.metadata.asked).toBe(3);
    expect(await reconcileFold(service)).toEqual({
      outcome: "folded",
      into: "target",
    });
    expect((await readFold(service, "target"))?.metadata.asked).toBe(5);
  });
});
