import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { ENTITY_CHANNELS } from "@brains/contracts";
import type { EntityPluginContext, InboxActor } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
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

  function withdraw(entityId: string): Promise<unknown> {
    return harness.sendMessage(ENTITY_CHANNELS.deleted, {
      entityType: "network-piece",
      entityId,
    });
  }

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-faq-stale-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());
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
