import { expect, test } from "bun:test";
import { SdkError } from "@brains/sdk/entities";
import { fileURLToPath } from "node:url";
import { createTestDirectory, waitUntil } from "@brains/test-utils";
import {
  openCaptureStorage,
  type CaptureFixture,
} from "./helpers/capture-storage";
import * as faqAdapter from "../src/lib/faq-content";
import { faqMetadata } from "../src/lib/faq-content";
import { prepareFaqMerge } from "../src/lib/faq-merge";
import { faqSchema } from "../src/schemas/faq";

async function seedTarget(fixture: CaptureFixture): Promise<void> {
  const fields = {
    question: "What do you offer?",
    status: "draft" as const,
    asked: 4,
  };
  await fixture.service.createEntity({
    entity: {
      id: "target",
      entityType: "faq",
      visibility: "public",
      content: faqAdapter.createFaqContent(fields, "Original answer."),
      metadata: faqMetadata(fields),
    },
  });
}
async function counts(fixture: CaptureFixture): Promise<number[]> {
  const rows = await fixture.service.listEntities({
    entityType: "faq",
    options: { filter: { visibilityScope: "restricted" } },
  });
  return rows.map(
    (row) => faqAdapter.parseFaqContent(row.content).frontmatter.asked,
  );
}
const receipt = { namespace: "faq.capture", key: "reply" };

test("owned capture bounds CAS retries without replaying classification or consuming the receipt", async () => {
  const directory = await createTestDirectory("faq-capture-contention");
  let classifications = 0;
  const fixture = await openCaptureStorage(directory.dir, {
    targetId: "target",
    classify: async (): Promise<void> => {
      classifications++;
    },
  });
  await seedTarget(fixture);
  const apply = fixture.service.applyEntityMutationOnce.bind(fixture.service);
  let attempts = 0;
  fixture.service.applyEntityMutationOnce = async (
    input,
  ): ReturnType<typeof apply> => {
    if (input.operation === "update") {
      attempts++;
      const current = await fixture.service.getEntity(
        { entityType: "faq", id: "target" },
        faqSchema,
      );
      if (!current) throw new Error("Missing target");
      await fixture.service.updateEntity({
        entity: prepareFaqMerge(current, { asks: 1 }),
      });
    }
    return apply(input);
  };
  try {
    const error = await fixture
      .process()
      .catch((cause: unknown): unknown => cause);
    expect(error).toMatchObject({
      message: "FAQ target kept changing during merge",
      cause: { code: "conflict" },
    });
    expect(attempts).toBe(3);
    expect(classifications).toBe(1);
    expect(await fixture.service.getEntityMutationReceipt(receipt)).toBeNull();
    expect(await counts(fixture)).toEqual([7]);
    fixture.service.applyEntityMutationOnce = apply;
    expect(await fixture.process()).toEqual({
      captured: true,
      entityId: "target",
      merged: true,
    });
    expect(await counts(fixture)).toEqual([8]);
    expect(classifications).toBe(2);
    expect(await fixture.process()).toEqual({
      captured: false,
      reason: "already-captured",
    });
    expect(classifications).toBe(2);
  } finally {
    fixture.close();
    await directory.cleanup();
  }
});

for (const merge of [false, true]) {
  for (const checkpoint of ["before-classify", "before-write", "after-write"]) {
    test(`${merge ? "merge" : "create"} retries after SIGKILL ${checkpoint}`, async () => {
      const directory = await createTestDirectory("faq-capture-crash");
      const seed = await openCaptureStorage(directory.dir);
      if (merge) await seedTarget(seed);
      seed.close();
      const child = Bun.spawn(
        [
          process.execPath,
          fileURLToPath(
            new URL("./helpers/capture-crash-child.ts", import.meta.url),
          ),
          directory.dir,
          checkpoint,
          ...(merge ? ["target"] : []),
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      let fixture: CaptureFixture | undefined;
      try {
        await waitUntil(
          async () => {
            if (child.exitCode !== null)
              throw new Error(await new Response(child.stderr).text());
            return Bun.file(`${directory.dir}/paused`).exists();
          },
          "the capture checkpoint",
          { timeoutMs: 10000 },
        );
        child.kill("SIGKILL");
        await child.exited;
        expect(child.signalCode).toBe("SIGKILL");
        fixture = await openCaptureStorage(
          directory.dir,
          merge ? { targetId: "target" } : {},
        );
        expect(await fixture.process()).toMatchObject(
          checkpoint === "after-write"
            ? { captured: false, reason: "already-captured" }
            : { captured: true, merged: merge },
        );
        expect(await fixture.process()).toEqual({
          captured: false,
          reason: "already-captured",
        });
        expect(await counts(fixture)).toEqual([merge ? 5 : 1]);
        expect(await fixture.replies.has("reply")).toBe(false);
        expect(
          await fixture.service.getEntityMutationReceipt(receipt),
        ).toMatchObject({ operation: merge ? "update" : "create" });
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
        await child.exited;
        fixture?.close();
        await directory.cleanup();
      }
    }, 20000);
  }
}

test("preserves ambiguous legacy claims without replay or deletion", async () => {
  const directory = await createTestDirectory("faq-capture-legacy");
  const fixture = await openCaptureStorage(directory.dir, {
    classify: async () => {
      throw new Error("Must not replay legacy capture");
    },
  });
  try {
    const legacy = { claimedAt: "2026-01-01T00:00:00.000Z" };
    await fixture.replies.set("reply", legacy);
    expect(await fixture.process()).toEqual({
      captured: false,
      reason: "already-captured",
    });
    expect(await fixture.replies.get("reply")).toEqual(legacy);
    expect(await counts(fixture)).toEqual([]);
    expect(await fixture.service.getEntityMutationReceipt(receipt)).toBeNull();
  } finally {
    fixture.close();
    await directory.cleanup();
  }
});

test("observed classification failure remains retryable", async () => {
  const directory = await createTestDirectory("faq-capture-provider-failure");
  let attempts = 0;
  const fixture = await openCaptureStorage(directory.dir, {
    classify: async () => {
      if (++attempts === 1) throw new Error("Observed provider failure");
    },
  });
  try {
    const failure = await fixture.process().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(await fixture.service.getEntityMutationReceipt(receipt)).toBeNull();
    expect(await fixture.process()).toMatchObject({ captured: true });
    expect(await counts(fixture)).toEqual([1]);
  } finally {
    fixture.close();
    await directory.cleanup();
  }
});

for (const merge of [false, true]) {
  test(`observed post-commit ${merge ? "merge" : "create"} failure does not repeat the effect`, async () => {
    const directory = await createTestDirectory("faq-capture-postcommit");
    let calls = 0;
    const fixture = await openCaptureStorage(directory.dir, {
      ...(merge && { targetId: "target" }),
      classify: async () => {
        calls++;
      },
    });
    if (merge) await seedTarget(fixture);
    const apply = fixture.service.applyEntityMutationOnce.bind(fixture.service);
    fixture.service.applyEntityMutationOnce = async (
      input,
    ): ReturnType<typeof apply> => {
      await apply(input);
      throw new Error("Lost acknowledgement after commit");
    };
    try {
      expect(
        await fixture.process().catch((error: unknown) => error),
      ).toBeInstanceOf(Error);
      expect(await fixture.process()).toEqual({
        captured: false,
        reason: "already-captured",
      });
      expect(await counts(fixture)).toEqual([merge ? 5 : 1]);
      expect(calls).toBe(1);
    } finally {
      fixture.close();
      await directory.cleanup();
    }
  });
}

for (const change of ["restricted", "shared", "question"] as const) {
  test(`a capture does not reuse a target whose ${change} eligibility changed`, async () => {
    const directory = await createTestDirectory("faq-capture-eligibility");
    const fixture = await openCaptureStorage(directory.dir, {
      targetId: "target",
    });
    await seedTarget(fixture);
    const apply = fixture.service.applyEntityMutationOnce.bind(fixture.service);
    let interleaved = false;
    fixture.service.applyEntityMutationOnce = async (
      input,
    ): ReturnType<typeof apply> => {
      if (input.operation === "update" && !interleaved) {
        interleaved = true;
        const current = await fixture.service.getEntity({
          entityType: "faq",
          id: "target",
          visibilityScope: "restricted",
        });
        if (!current) throw new Error("Missing target");
        const fields = faqAdapter.parseFaqContent(current.content).frontmatter;
        if (change === "question") fields.question = "A different question?";
        await fixture.service.updateEntity({
          entity: {
            ...current,
            visibility: change === "question" ? "public" : change,
            content: faqAdapter.createFaqContent(
              fields,
              "Changed target answer.",
            ),
            metadata: faqMetadata(fields),
          },
        });
      }
      return apply(input);
    };
    try {
      expect(await fixture.process()).toMatchObject({
        captured: true,
        merged: false,
      });
      expect((await counts(fixture)).sort()).toEqual([1, 4]);
      const completion =
        await fixture.service.getEntityMutationReceipt(receipt);
      if (!completion || completion.operation === "none")
        throw new Error("Missing write receipt");
      expect(completion.entityId).not.toBe("target");
      const captured = await fixture.service.getEntity({
        entityType: "faq",
        id: completion.entityId,
        visibilityScope: "public",
      });
      expect(captured?.visibility).toBe("public");
      expect(captured?.content).not.toContain("Changed target answer.");
    } finally {
      fixture.close();
      await directory.cleanup();
    }
  });
}

for (const winnerWrites of [false, true]) {
  test(`an older attempt cannot override a newer ${winnerWrites ? "write" : "non-reusable decision"}`, async () => {
    const directory = await createTestDirectory("faq-capture-stale-attempt");
    const started = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const older = await openCaptureStorage(directory.dir, {
      classify: async () => {
        started.resolve();
        await resume.promise;
      },
    });
    const newer = await openCaptureStorage(
      directory.dir,
      winnerWrites
        ? {}
        : { classification: { reusable: false, question: "", answer: "" } },
    );
    const pending = older.process();
    try {
      await started.promise;
      const winner = await newer.process();
      resume.resolve();
      const late = await pending;
      expect(winner.captured).toBe(winnerWrites);
      if (winnerWrites) expect(late).toEqual(winner);
      else
        expect(late).toEqual({ captured: false, reason: "already-captured" });
      expect(await counts(newer)).toEqual(winnerWrites ? [1] : []);
      expect(await newer.process()).toEqual({
        captured: false,
        reason: "already-captured",
      });
    } finally {
      resume.resolve();
      await pending;
      older.close();
      newer.close();
      await directory.cleanup();
    }
  });
}

for (const merge of [false, true]) {
  test(`concurrent ${merge ? "merge" : "create"} attempts count once`, async () => {
    const directory = await createTestDirectory("faq-capture-concurrent");
    const ready = Promise.withResolvers<void>();
    let calls = 0;
    const options = {
      ...(merge && { targetId: "target" }),
      classify: async (): Promise<void> => {
        if (++calls === 2) ready.resolve();
        await ready.promise;
      },
    };
    const left = await openCaptureStorage(directory.dir, options);
    const right = await openCaptureStorage(directory.dir, options);
    if (merge) await seedTarget(left);
    await left.service.initialize();
    await right.service.initialize();
    try {
      const outcomes = await Promise.allSettled(
        [left.process(), right.process()].map(async (attempt) => {
          try {
            return await attempt;
          } catch (error) {
            ready.resolve();
            throw error;
          }
        }),
      );
      expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(
        true,
      );
      for (const outcome of outcomes) {
        if (outcome.status !== "rejected") continue;
        expect(outcome.reason).toBeInstanceOf(SdkError);
        if (!(outcome.reason instanceof SdkError))
          throw new Error("Expected SDK failure");
        expect(outcome.reason.code).toBe("handler_failed");
        expect(String(outcome.reason.cause)).toContain("SQLITE_BUSY");
        expect(JSON.stringify(outcome.reason)).not.toContain("SQLITE_BUSY");
      }
      // A refused SQLite writer can retry; classification callbacks are never
      // replayed by the transaction runner itself.
      expect(await left.process()).toEqual({
        captured: false,
        reason: "already-captured",
      });
      expect(await right.process()).toEqual({
        captured: false,
        reason: "already-captured",
      });
      expect(await counts(left)).toEqual([merge ? 5 : 1]);
      expect(calls).toBe(2);
    } finally {
      left.close();
      right.close();
      await directory.cleanup();
    }
  }, 20000);
}
