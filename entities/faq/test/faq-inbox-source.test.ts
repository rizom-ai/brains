import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { EntityService } from "@brains/entity-service";
import { createTestDirectory } from "@brains/test-utils";
import { openFoldStorage } from "./helpers/fold-storage";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { randomUUID } from "node:crypto";
import type {
  ContentVisibility,
  EntityPluginContext,
  InboxActor,
  InboxSource,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  faqPackage,
  faqMetadata,
  faqSchema,
  type FaqAlternative,
  type FaqStatus,
} from "../src";

import * as faqAdapter from "../src/lib/faq-content";

const owner: InboxActor = { permissionLevel: "admin" };

// FAQs that need the owner come to the Inbox: a question captured as a draft,
// to publish or decline, and a FAQ that was answered differently since, to
// settle on one answer.
describe.each(["mock", "sqlite"])("FAQ inbox (%s)", (backend) => {
  let service: EntityService | undefined;
  let directory: Awaited<ReturnType<typeof createTestDirectory>> | undefined;
  let context: EntityPluginContext;
  let harness: ReturnType<typeof createPluginHarness>;
  let source: Pick<InboxSource, "list"> & {
    resolveDetail(
      itemId: string,
      actor: InboxActor,
      signal: AbortSignal,
    ): ReturnType<NonNullable<InboxSource["resolveDetail"]>>;
    act(itemId: string, actionId: string, actor: InboxActor): Promise<void>;
  };
  afterEach(async () => {
    await harness.reset();
    service?.close();
    await directory?.cleanup();
  });

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
    if (backend === "sqlite") {
      directory = await createTestDirectory("faq-inbox");
      service = await openFoldStorage(directory.dir);
      await service.initialize();
    }
    harness = createPluginHarness({
      dataDir: directory?.dir ?? `/tmp/test-faq-inbox-${randomUUID()}`,
      ...(service ? { entityService: service } : {}),
    });
    for (const plugin of instantiatePluginPackageDefinition(
      faqPackage,
      {},
      { name: "@brains/faq", version: "0.0.0-test" },
    ))
      await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    context = harness.getEntityContext("faq");
    const registered = harness
      .getMockShell()
      .getInboxRegistry()
      .getSource("faq");
    const resolveDetail = registered?.resolveDetail;
    if (!registered || !resolveDetail)
      throw new Error("FAQ inbox source is not registered");
    source = {
      list: (): ReturnType<InboxSource["list"]> => registered.list(),
      resolveDetail: (
        id,
        actor,
        signal,
      ): ReturnType<NonNullable<InboxSource["resolveDetail"]>> =>
        harness.withCaller(
          (caller) => resolveDetail(id, actor, signal, caller),
          { permission: actor.permissionLevel, signal },
        ),
      act: (id, action, actor): Promise<void> =>
        harness.withCaller(
          (caller) => registered.act(id, action, actor, caller),
          { permission: actor.permissionLevel },
        ),
    };

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
    const detail = await source.resolveDetail(
      "answered-twice",
      owner,
      new AbortController().signal,
    );
    expect(detail.text).toContain("Answer answered-twice.");
    expect(detail.text).toContain("Alternative 1");
    expect(detail.text).toContain("A clearer answer.");
  });

  it("publishes a new question with caller attribution", async () => {
    const update = spyOn(context.entityService, "updateEntity");
    await source.act("visitor-draft", "publish", owner);
    expect(
      update.mock.calls[0]?.[0].options?.eventContext?.actor,
    ).toMatchObject({ kind: "user", userId: "test-user" });
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

  it.each(["publish", "decline"])(
    "refuses %s after metadata-only drift at the storage boundary",
    async (action) => {
      const entities = context.entityService;
      const update = entities.updateEntity.bind(entities);
      const remove = entities.deleteEntity.bind(entities);
      const interfere = async (): Promise<void> => {
        const current = await entities.getEntity(
          {
            entityType: "faq",
            id: "visitor-draft",
            visibilityScope: "restricted",
          },
          faqSchema,
        );
        if (!current) throw new Error("Missing draft");
        await update({
          entity: { ...current, metadata: { ...current.metadata, rank: 7 } },
        });
      };
      if (action === "publish")
        spyOn(entities, "updateEntity").mockImplementationOnce(
          async (request) => {
            await interfere();
            return update(request);
          },
        );
      else
        spyOn(entities, "deleteEntity").mockImplementationOnce(
          async (request) => {
            await interfere();
            return remove(request);
          },
        );
      expect(
        await source
          .act("visitor-draft", action, owner)
          .catch((error: unknown) => error),
      ).toMatchObject({ code: "conflict" });
      expect((await read("visitor-draft"))?.status).toBe("draft");
      expect(
        (
          await entities.getEntity(
            {
              entityType: "faq",
              id: "visitor-draft",
              visibilityScope: "restricted",
            },
            faqSchema,
          )
        )?.metadata.rank,
      ).toBe(7);
    },
  );

  it("acts only for the owner", async () => {
    const trusted: InboxActor = { permissionLevel: "trusted" };
    expect(
      await source
        .act("visitor-draft", "publish", trusted)
        .catch((error: unknown) => error),
    ).toMatchObject({ message: expect.stringContaining("admin") });
    expect((await read("visitor-draft"))?.status).toBe("draft");
  });
});
