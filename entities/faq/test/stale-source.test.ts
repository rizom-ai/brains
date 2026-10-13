import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import { ENTITY_CHANNELS } from "@brains/contracts";
import type { EntityPluginContext, InboxActor } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  FaqSourceReviewHandler,
  faqSourceReviewSchema,
} from "../src/handlers/faq-source-review-handler";
import {
  FaqInboxSource,
  FaqPlugin,
  faqAdapter,
  faqMetadata,
  faqSchema,
  type FaqFrontmatter,
} from "../src";

// A published FAQ cites a piece from another brain. When that piece leaves
// the index, the FAQ goes to the Inbox for review: the owner keeps the
// answer or takes it down. Nothing is changed for them.
describe("a FAQ whose cited piece left the network", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let context: EntityPluginContext;
  let handler: FaqSourceReviewHandler;
  const owner: InboxActor = { permissionLevel: "admin" };

  async function seed(
    id: string,
    sources: FaqFrontmatter["sources"],
    status: FaqFrontmatter["status"] = "published",
  ): Promise<void> {
    const frontmatter: FaqFrontmatter = {
      question: `Question ${id}?`,
      status,
      asked: 3,
      ...(sources ? { sources } : {}),
    };
    await context.entityService.createEntity({
      entity: {
        id,
        entityType: "faq",
        content: faqAdapter.createFaqContent(frontmatter, `Answer ${id}.`),
        visibility: "public",
        metadata: faqMetadata(frontmatter),
      },
    });
  }

  async function frontmatterOf(id: string): Promise<FaqFrontmatter> {
    const faq = await context.entityService.getEntity(
      { entityType: "faq", id, visibilityScope: "public" },
      faqSchema,
    );
    if (!faq) throw new Error(`Missing ${id}`);
    return faqAdapter.parseFaqContent(faq.content).frontmatter;
  }

  async function withdraw(entityId: string): Promise<void> {
    await harness.sendMessage(ENTITY_CHANNELS.deleted, {
      entityType: "network-piece",
      entityId,
    });
    const jobs = await harness
      .getMockShell()
      .getJobQueueService()
      .getActiveJobs(["faq:faq-source-review"]);
    const job = jobs.at(-1);
    if (!job) throw new Error("Missing durable source review job");
    expect(faqSourceReviewSchema.parse(JSON.parse(job.data))).toEqual({
      sourceId: `network-piece:${entityId}`,
      withdrawalId: expect.any(String),
    });
    await handler.process(
      faqSourceReviewSchema.parse(JSON.parse(job.data)),
      job.id,
      createMockProgressReporter(),
    );
  }

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-faq-stale-${randomUUID()}`,
    });
    const registered = spyOn(
      harness.getMockShell().getJobQueueService(),
      "registerHandler",
    );
    await harness.installPlugin(new FaqPlugin());
    const sourceReview = registered.mock.calls.find(
      ([type]) => type === "faq:faq-source-review",
    )?.[1];
    if (!(sourceReview instanceof FaqSourceReviewHandler))
      throw new Error("Missing source review registration");
    handler = sourceReview;
    context = harness.getEntityContext("faq");
    await seed("cites-becca", [
      {
        id: "network-piece:plc-peer--post--3kabc",
        title: "Handoffs between teams",
        brain: { name: "Becca" },
      },
      { id: "post:what-a-brain-is", title: "What a brain is" },
    ]);
    await seed("cites-own", [
      { id: "post:what-a-brain-is", title: "What a brain is" },
    ]);
    await seed(
      "draft-cites-becca",
      [{ id: "network-piece:plc-peer--post--3kabc", title: "Handoffs" }],
      "draft",
    );
  });

  it("marks the published FAQs that cited the piece for review, and no other", async () => {
    await withdraw("plc-peer--post--3kabc");
    expect((await frontmatterOf("cites-becca")).review).toBe(
      "source-withdrawn",
    );
    expect((await frontmatterOf("cites-becca")).status).toBe("published");
    expect((await frontmatterOf("cites-own")).review).toBeUndefined();
    expect((await frontmatterOf("draft-cites-becca")).review).toBeUndefined();
  });

  it("ignores the deletion of anything that is not a network piece", async () => {
    await harness.sendMessage(ENTITY_CHANNELS.deleted, {
      entityType: "post",
      entityId: "what-a-brain-is",
    });
    expect((await frontmatterOf("cites-own")).review).toBeUndefined();
  });

  it("reaches the Inbox, where the owner keeps the answer or takes it down", async () => {
    await withdraw("plc-peer--post--3kabc");
    const inbox = new FaqInboxSource(context);
    const items = await inbox.list();
    const item = items.find((entry) => entry.id === "cites-becca");
    expect(item?.summary).toContain("left the network");
    expect(item?.actions.map((action) => action.id)).toEqual([
      "keep-published",
      "unpublish",
    ]);
    expect(items.some((entry) => entry.id === "cites-own")).toBe(false);
    const detail = await inbox.resolveDetail(
      "cites-becca",
      owner,
      new AbortController().signal,
    );
    expect(detail.text).toContain("Handoffs between teams");

    await inbox.act("cites-becca", "keep-published", owner);
    const kept = await frontmatterOf("cites-becca");
    expect(kept.review).toBeUndefined();
    expect(kept.status).toBe("published");
    expect(
      (await inbox.list()).some((entry) => entry.id === "cites-becca"),
    ).toBe(false);

    await withdraw("plc-peer--post--3kabc");
    await inbox.act("cites-becca", "unpublish", owner);
    const taken = await frontmatterOf("cites-becca");
    expect(taken.review).toBeUndefined();
    expect(taken.status).toBe("draft");
  });
});
