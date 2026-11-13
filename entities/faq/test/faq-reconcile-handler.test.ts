import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  type FaqReconcileDeps,
  faqDocument,
  faqMetadata,
  faqSchema,
  readFaq,
  type FaqEntity,
  type FaqFrontmatter,
  type FaqStatus,
} from "../src";
import { createFaqPlugins } from "./faq-plugins";
import { reconcileHandler } from "./helpers/jobs";

interface DistanceResult {
  entityId: string;
  entityType: string;
  distance: number;
}

describe("FaqReconcileHandler", () => {
  let context: EntityPluginContext;
  let distances: DistanceResult[];
  let sameVerdict: boolean;

  function handler(
    entityService: FaqReconcileDeps["entityService"] = context.entityService,
    ai: FaqReconcileDeps["ai"] = {
      generateObject: async <T>(
        _prompt: string,
        schema: { parse(value: unknown): T },
      ): Promise<{ object: T }> => ({
        object: schema.parse({ same: sameVerdict }),
      }),
    },
  ): ReturnType<typeof reconcileHandler> {
    return reconcileHandler({
      entityService,
      sameQuestionDistance: 0.2,
      searchWithDistances: async (): Promise<DistanceResult[]> => distances,
      ai,
    });
  }

  function reconcile(
    entityId: string,
    entityService?: FaqReconcileDeps["entityService"],
  ): ReturnType<ReturnType<typeof reconcileHandler>["process"]> {
    return handler(entityService).process(
      { entityId },
      "job-1",
      createMockProgressReporter(),
      new AbortController().signal,
    );
  }

  async function seed(
    id: string,
    options: {
      created: string;
      status?: FaqStatus;
      visibility?: ContentVisibility;
      asked?: number;
    },
  ): Promise<void> {
    const frontmatter: FaqFrontmatter = {
      question: `Question ${id}?`,
      status: options.status ?? "draft",
      asked: options.asked ?? 1,
    };
    await context.entityService.createEntity({
      entity: {
        id,
        entityType: "faq",
        content: faqDocument(frontmatter, `Answer ${id}.`),
        visibility: options.visibility ?? "restricted",
        created: options.created,
        metadata: faqMetadata(frontmatter),
      },
    });
  }

  async function faqs(): Promise<FaqEntity[]> {
    return context.entityService.listEntities(
      {
        entityType: "faq",
        options: { filter: { visibilityScope: "restricted" } },
      },
      faqSchema,
    );
  }

  /** Search results as the index returns them: the FAQ itself first, at 0. */
  function near(self: string, id: string, distance = 0.05): void {
    distances = [
      { entityId: self, entityType: "faq", distance: 0 },
      { entityId: id, entityType: "faq", distance },
    ];
  }

  beforeEach(async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-reconcile-${randomUUID()}`,
    });
    for (const plugin of createFaqPlugins())
      await harness.installPlugin(plugin);
    context = harness.getEntityContext("faq");
    distances = [];
    sameVerdict = true;
  });

  it("folds a newer draft into the older FAQ asking the same question", async () => {
    await seed("older", { created: "2026-09-01T00:00:00.000Z" });
    await seed("newer", {
      created: "2026-09-02T00:00:00.000Z",
      asked: 2,
    });
    near("newer", "older");

    const result = await reconcile("newer");

    expect(result).toEqual({ outcome: "folded", into: "older" });
    const remaining = await faqs();
    expect(remaining.map((faq) => faq.id)).toEqual(["older"]);
    const parsed = readFaq(remaining[0] ?? { content: "" });
    expect(parsed.answer).toBe("Answer older.");
    expect(remaining[0]?.metadata.asked).toBe(3);
    expect(parsed.alternatives).toEqual([{ answer: "Answer newer." }]);
  });

  it("stops when its job is cancelled, folding nothing", async () => {
    await seed("older", { created: "2026-09-01T00:00:00.000Z" });
    await seed("newer", { created: "2026-09-02T00:00:00.000Z" });
    near("newer", "older");
    // A same-question check that only ends when it is cancelled, as a slow
    // model call past the job's deadline.
    const asked = Promise.withResolvers<void>();
    const hanging = handler(context.entityService, {
      generateObject: (_prompt, _schema, signal) => {
        asked.resolve();
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });
    const job = new AbortController();
    const reason = new Error("deadline exceeded");

    const result = hanging
      .process(
        { entityId: "newer" },
        "job-1",
        createMockProgressReporter(),
        job.signal,
      )
      .catch((error: unknown) => error);
    await asked.promise;
    job.abort(reason);

    expect(await result).toBe(reason);
    expect(await faqs()).toHaveLength(2);
  });

  it("keeps the older FAQ; the newer one folds itself", async () => {
    await seed("older", { created: "2026-09-01T00:00:00.000Z" });
    await seed("newer", { created: "2026-09-02T00:00:00.000Z" });
    near("older", "newer");

    expect(await reconcile("older")).toEqual({ outcome: "kept" });
    expect(await faqs()).toHaveLength(2);
  });

  it("folds a draft into a published FAQ even when the draft is older", async () => {
    await seed("draft", { created: "2026-09-01T00:00:00.000Z" });
    await seed("published", {
      created: "2026-09-02T00:00:00.000Z",
      status: "published",
    });
    near("draft", "published");

    expect(await reconcile("draft")).toEqual({
      outcome: "folded",
      into: "published",
    });
    expect((await faqs()).map((faq) => faq.id)).toEqual(["published"]);
  });

  it("never folds a published FAQ", async () => {
    await seed("older", { created: "2026-09-01T00:00:00.000Z" });
    await seed("published", {
      created: "2026-09-02T00:00:00.000Z",
      status: "published",
    });
    near("published", "older");

    expect(await reconcile("published")).toEqual({ outcome: "published" });
    expect(await faqs()).toHaveLength(2);
  });

  it("never folds across visibility", async () => {
    await seed("public", {
      created: "2026-09-01T00:00:00.000Z",
      visibility: "public",
    });
    await seed("restricted", { created: "2026-09-02T00:00:00.000Z" });
    near("restricted", "public");

    expect(await reconcile("restricted")).toEqual({ outcome: "unique" });
    expect(await faqs()).toHaveLength(2);
  });

  it("leaves a FAQ with no near match alone", async () => {
    await seed("older", { created: "2026-09-01T00:00:00.000Z" });
    await seed("newer", { created: "2026-09-02T00:00:00.000Z" });
    near("newer", "older", 0.4);

    expect(await reconcile("newer")).toEqual({ outcome: "unique" });
    expect(await faqs()).toHaveLength(2);
  });

  it("does nothing for a FAQ that no longer exists", async () => {
    expect(await reconcile("gone")).toEqual({ outcome: "gone" });
  });

  it("folds nothing when the duplicate changed after it was read", async () => {
    await seed("older", { created: "2026-09-01T00:00:00.000Z" });
    await seed("newer", { created: "2026-09-02T00:00:00.000Z" });
    near("newer", "older");
    // A capture counts another asking on the duplicate after reconcile read
    // it, just before reconcile removes it.
    const askedMeanwhile: FaqReconcileDeps["entityService"] = {
      ...context.entityService,
      foldEntity: async (request) => {
        const current = await context.entityService.getEntity(
          {
            entityType: "faq",
            id: request.source.id,
            visibilityScope: "restricted",
          },
          faqSchema,
        );
        if (current) {
          const frontmatter: FaqFrontmatter = {
            question: current.metadata.question,
            status: current.metadata.status,
            asked: current.metadata.asked + 1,
          };
          await context.entityService.updateEntity({
            entity: {
              ...current,
              content: faqDocument(frontmatter, `Answer ${request.source.id}.`),
              metadata: faqMetadata(frontmatter),
            },
          });
        }
        return context.entityService.foldEntity(request);
      },
    };

    expect(await reconcile("newer", askedMeanwhile)).toEqual({
      outcome: "changed",
    });
    const remaining = await faqs();
    expect(
      remaining
        .map((faq) => [faq.id, faq.metadata.asked])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ).toEqual([
      ["newer", 2],
      ["older", 1],
    ]);
  });

  it("preserves the duplicate when the FAQ it folds into disappears", async () => {
    await seed("older", { created: "2026-09-01T00:00:00.000Z" });
    await seed("newer", { created: "2026-09-02T00:00:00.000Z", asked: 2 });
    near("newer", "older");
    const vanishingTarget: FaqReconcileDeps["entityService"] = {
      ...context.entityService,
      foldEntity: async (request) => {
        await context.entityService.deleteEntity({
          entityType: "faq",
          id: "older",
        });
        return context.entityService.foldEntity(request);
      },
    };

    expect(await reconcile("newer", vanishingTarget)).toEqual({
      outcome: "changed",
    });
    const remaining = await faqs();
    expect(remaining.map((faq) => faq.id)).toEqual(["newer"]);
    expect(remaining[0]?.metadata.asked).toBe(2);
    expect(remaining[0]?.created).toBe("2026-09-02T00:00:00.000Z");
    expect(readFaq(remaining[0] ?? { content: "" }).answer).toBe(
      "Answer newer.",
    );
  });

  it("keeps both when the check says they ask different questions", async () => {
    await seed("older", { created: "2026-09-01T00:00:00.000Z" });
    await seed("newer", { created: "2026-09-02T00:00:00.000Z" });
    near("newer", "older");
    sameVerdict = false;

    expect(await reconcile("newer")).toEqual({ outcome: "unique" });
    expect(await faqs()).toHaveLength(2);
  });
});
