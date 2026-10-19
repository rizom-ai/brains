import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type {
  ContentVisibility,
  EntityPluginContext,
  InboxActor,
  InboxSource,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  FaqPlugin,
  faqAdapter,
  faqMetadata,
  faqSchema,
  type FaqAlternative,
  type FaqStatus,
} from "../src";

const owner: InboxActor = { permissionLevel: "admin" };

// FAQs that need the owner come to the Inbox: a question captured as a draft,
// to publish or decline, and a FAQ that was answered differently since, to
// settle on one answer.
describe("FAQ inbox", () => {
  let context: EntityPluginContext;
  let source: InboxSource;

  async function seed(
    id: string,
    status: FaqStatus,
    visibility: ContentVisibility,
    alternatives: FaqAlternative[] = [],
  ): Promise<void> {
    const frontmatter = {
      question: `Question ${id}?`,
      status,
      asked: 1 + alternatives.length,
    };
    await context.entityService.createEntity({
      entity: {
        id,
        entityType: "faq",
        content: faqAdapter.createFaqContent(
          frontmatter,
          `Answer ${id}.`,
          alternatives,
        ),
        visibility,
        metadata: faqMetadata(frontmatter),
      },
    });
  }

  async function read(id: string): Promise<{
    status: FaqStatus;
    answer: string;
    alternatives: FaqAlternative[];
  } | null> {
    const faq = await context.entityService.getEntity(
      { entityType: "faq", id, visibilityScope: "restricted" },
      faqSchema,
    );
    if (!faq) return null;
    const parsed = faqAdapter.parseFaqContent(faq.content);
    return {
      status: parsed.frontmatter.status,
      answer: parsed.answer,
      alternatives: parsed.alternatives,
    };
  }

  beforeEach(async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-inbox-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());
    await harness.finalizeRegistration();
    context = harness.getEntityContext("faq");
    const registered = harness
      .getMockShell()
      .getInboxRegistry()
      .getSource("faq");
    if (!registered) throw new Error("FAQ inbox source is not registered");
    source = registered;

    await seed("visitor-draft", "draft", "public");
    await seed("owner-draft", "draft", "restricted");
    await seed("settled", "published", "public");
    await seed("answered-twice", "published", "public", [
      { answer: "A clearer answer." },
    ]);
  });

  it("brings a new question to publish or decline, whoever asked it", async () => {
    const items = await source.list();
    const draft = items.find((item) => item.id === "visitor-draft");
    expect(draft).toMatchObject({
      title: "Question visitor-draft?",
      entityRef: { entityType: "faq", entityId: "visitor-draft" },
      actions: [
        { id: "publish", label: "Publish" },
        { id: "decline", label: "Decline", confirm: true },
      ],
    });
    expect(items.map((item) => item.id)).toContain("owner-draft");
    expect(items.map((item) => item.id)).not.toContain("settled");
  });

  it("brings a FAQ answered differently, to settle on one answer", async () => {
    const items = await source.list();
    expect(items.find((item) => item.id === "answered-twice")).toMatchObject({
      title: "Question answered-twice?",
      actions: [
        { id: "use-alternative-1", label: "Use alternative 1" },
        { id: "keep-current", label: "Keep current answer" },
      ],
    });
  });

  it("shows the answer and its alternatives", async () => {
    const detail = await source.resolveDetail?.(
      "answered-twice",
      owner,
      new AbortController().signal,
    );
    expect(detail?.text).toContain("Answer answered-twice.");
    expect(detail?.text).toContain("Alternative 1");
    expect(detail?.text).toContain("A clearer answer.");
  });

  it("publishes a new question", async () => {
    await source.act("visitor-draft", "publish", owner);
    expect((await read("visitor-draft"))?.status).toBe("published");
    expect((await source.list()).map((item) => item.id)).not.toContain(
      "visitor-draft",
    );
  });

  it("declines a new question by deleting it", async () => {
    await source.act("visitor-draft", "decline", owner);
    expect(await read("visitor-draft")).toBeNull();
  });

  it("settles a FAQ on the chosen answer, or the current one", async () => {
    await source.act("answered-twice", "use-alternative-1", owner);
    expect(await read("answered-twice")).toEqual({
      status: "published",
      answer: "A clearer answer.",
      alternatives: [],
    });

    await seed("kept", "published", "public", [{ answer: "Another." }]);
    await source.act("kept", "keep-current", owner);
    expect(await read("kept")).toEqual({
      status: "published",
      answer: "Answer kept.",
      alternatives: [],
    });
  });

  it("acts only for the owner", async () => {
    const trusted: InboxActor = { permissionLevel: "trusted" };
    expect(source.act("visitor-draft", "publish", trusted)).rejects.toThrow(
      "admin",
    );
    expect((await read("visitor-draft"))?.status).toBe("draft");
  });
});
