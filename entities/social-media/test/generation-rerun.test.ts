import { describe, expect, it } from "bun:test";
import { imageGenerateJobContract } from "@brains/contracts";
import type { JobQueueEnqueueRequest } from "@brains/job-queue";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { socialMediaPlugin } from "./social-media-plugin";

/** A job the package queued for itself, as the runtime queues it. */
function asPackage(input: unknown): unknown {
  return {
    authority: {
      actor: { kind: "service", serviceId: "social-media" },
      permissionCeiling: "public",
    },
    input,
    byPackage: true,
  };
}

/**
 * A social post generation the queue runs again under its job id, after
 * its attempt died once the post was written: one post, queued for
 * publishing once, and its image queued with a key a rerun's enqueue is
 * skipped by while the first waits.
 */
describe("a social post generation run again under its job id", () => {
  it("writes one queued post and queues its image under one key", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("social-media-rerun"),
    });
    await harness.installPlugin(socialMediaPlugin());
    const queue = harness.getMockShell().getJobQueueService();
    const enqueued: JobQueueEnqueueRequest[] = [];
    const enqueue = queue.enqueue.bind(queue);
    queue.enqueue = async (request): Promise<string> => {
      enqueued.push(request);
      return enqueue(request);
    };
    const handler = queue.getHandler("social-post:generation");
    if (!handler) throw new Error("No social post generation");
    const run = (): Promise<unknown> =>
      handler.process(
        handler.validateAndParse(
          asPackage({
            title: "Launch Day",
            content: "We launched.",
            addToQueue: true,
            generateImage: true,
          }),
        ),
        "job-social",
        createMockProgressReporter(),
        new AbortController().signal,
      );

    const first = await run();
    const second = await run();

    const written = {
      success: true,
      entityId: "linkedin-launch-day",
      slug: "linkedin-launch-day",
    };
    expect(first).toMatchObject(written);
    expect(second).toMatchObject(written);
    const posts = await harness.getEntityService().listEntities({
      entityType: "social-post",
      options: { filter: { visibilityScope: "restricted" } },
    });
    expect(posts.map((post) => post.metadata["status"])).toEqual(["queued"]);
    const images = enqueued.filter(
      (request) => request.type === imageGenerateJobContract.type,
    );
    expect(
      images.map((request) => ({
        deduplication: request.options?.deduplication,
        deduplicationKey: request.options?.deduplicationKey,
      })),
    ).toEqual([
      {
        deduplication: "skip",
        deduplicationKey: `social-image:social-post:${posts[0]?.id}`,
      },
    ]);
  });
});
