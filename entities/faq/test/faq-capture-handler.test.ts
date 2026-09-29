import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type {
  ContentVisibility,
  EntityPluginContext,
  Message,
  UserPermissionLevel,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import {
  FaqCaptureHandler,
  FaqPlugin,
  faqAdapter,
  faqMetadata,
  faqSchema,
  type FaqClassification,
  type FaqEntity,
  SAME_QUESTION_CHECK,
} from "../src";

const CONVERSATION_ID = "conv-1";

interface DistanceResult {
  entityId: string;
  entityType: string;
  distance: number;
}

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
): Message {
  return {
    id,
    conversationId: CONVERSATION_ID,
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata: {},
  };
}

const transcript: Message[] = [
  message("m1", "user", "hi"),
  message("m2", "assistant", "Hello!"),
  message("m3", "user", "how do I publish a draft post?"),
  message("m4", "assistant", "Open it in Studio and choose Publish."),
];

const accepted: FaqClassification = {
  reusable: true,
  question: "How do I publish a draft post?",
  answer: "Open the post in Studio and choose Publish.",
};

describe("FaqCaptureHandler", () => {
  let context: EntityPluginContext;
  let prompts: string[];
  let checks: string[];
  let sameVerdict: boolean;
  let classification: FaqClassification;
  let searches: string[];
  let fetches: Array<
    { limit?: number; range?: { start: number; end: number } } | undefined
  >;
  let distances: DistanceResult[];

  function createHandler(
    messages: Message[] = transcript,
    sameQuestionDistance = 0.2,
  ): FaqCaptureHandler {
    return new FaqCaptureHandler(createSilentLogger(), {
      entityService: context.entityService,
      sameQuestionDistance,
      searchWithDistances: async (request): Promise<DistanceResult[]> => {
        searches.push(request.query);
        return distances;
      },
      conversations: {
        // Honours range and limit the way the conversation store does.
        getMessages: async (_id, options): Promise<Message[]> => {
          fetches.push(options);
          const range = options?.range;
          if (range) return messages.slice(range.start - 1, range.end);
          return options?.limit ? messages.slice(-options.limit) : messages;
        },
      },
      ai: {
        generateObject: async <T>(
          prompt: string,
          schema: { parse(value: unknown): T },
        ): Promise<{ object: T }> => {
          if (prompt.includes(SAME_QUESTION_CHECK)) {
            checks.push(prompt);
            return { object: schema.parse({ same: sameVerdict }) };
          }
          prompts.push(prompt);
          return { object: schema.parse(classification) };
        },
      },
    });
  }

  function capture(
    handler: FaqCaptureHandler,
    userPermissionLevel: UserPermissionLevel,
    messageId = "m4",
    position = 4,
  ): ReturnType<FaqCaptureHandler["process"]> {
    return handler.process(
      {
        conversationId: CONVERSATION_ID,
        messageId,
        userPermissionLevel,
        position,
      },
      "job-1",
      createMockProgressReporter(),
    );
  }

  async function capturedFaqs(): Promise<FaqEntity[]> {
    return context.entityService.listEntities(
      {
        entityType: "faq",
        options: { filter: { visibilityScope: "restricted" } },
      },
      faqSchema,
    );
  }

  /** Stores an earlier FAQ at `distance` from the incoming exchange. */
  async function seedMatch(
    visibility: ContentVisibility,
    distance: number,
  ): Promise<void> {
    await context.entityService.createEntity({
      entity: {
        id: "faq-old",
        entityType: "faq",
        content: faqAdapter.createFaqContent(
          {
            question: "How can I publish a draft?",
            status: "draft",
            sourceConversationId: "conv-0",
            sourceMessageId: "old",
            mergedMessageIds: [],
          },
          "Choose Publish in Studio.",
        ),
        visibility,
        metadata: {
          question: "How can I publish a draft?",
          status: "draft",
          asked: 1,
        },
      },
    });
    const [existing] = await capturedFaqs();
    if (!existing) throw new Error("Expected the seeded FAQ");
    distances = [
      { entityId: "note-1", entityType: "note", distance: 0.01 },
      { entityId: existing.id, entityType: "faq", distance },
    ];
  }

  beforeEach(async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());
    context = harness.getEntityContext("faq");
    prompts = [];
    checks = [];
    sameVerdict = true;
    classification = accepted;
    searches = [];
    fetches = [];
    distances = [];
  });

  for (const [level, visibility] of [
    ["admin", "restricted"],
    ["trusted", "shared"],
    ["public", "public"],
  ] as const) {
    it(`captures a ${level} turn as a ${visibility} draft`, async () => {
      const result = await capture(createHandler(), level);

      expect(result).toEqual({
        captured: true,
        entityId: "how-do-i-publish-a-draft-post-m4",
        merged: false,
      });
      const [faq] = await capturedFaqs();
      expect(faq?.visibility).toBe(visibility);
      expect(faq?.metadata).toEqual({
        question: "How do I publish a draft post?",
        status: "draft",
        asked: 1,
      });
      const parsed = faqAdapter.parseFaqContent(faq?.content ?? "");
      expect(parsed.answer).toBe("Open the post in Studio and choose Publish.");
      expect(parsed.frontmatter).toMatchObject({
        sourceConversationId: CONVERSATION_ID,
        sourceMessageId: "m4",
        mergedMessageIds: [],
      });
    });
  }

  it("classifies the answer against the nearest preceding user message", async () => {
    await capture(createHandler(), "admin");

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("how do I publish a draft post?");
    expect(prompts[0]).toContain("Open it in Studio and choose Publish.");
    expect(prompts[0]).not.toContain("hi\n");
  });

  it("creates nothing when the pair is not reusable", async () => {
    classification = { reusable: false, question: "", answer: "" };

    const result = await capture(createHandler(), "admin");

    expect(result).toEqual({ captured: false, reason: "not-reusable" });
    expect(await capturedFaqs()).toHaveLength(0);
  });

  it("skips an answer with no preceding question", async () => {
    const result = await capture(
      createHandler([message("m4", "assistant", "Welcome!")]),
      "admin",
    );

    expect(result).toEqual({ captured: false, reason: "no-question" });
    expect(prompts).toHaveLength(0);
  });

  it("skips an answer that is no longer in the conversation", async () => {
    const result = await capture(createHandler(), "admin", "gone");

    expect(result).toEqual({ captured: false, reason: "answer-not-found" });
    expect(prompts).toHaveLength(0);
  });

  it("captures each answer once", async () => {
    const handler = createHandler();
    await capture(handler, "admin");

    const result = await capture(handler, "admin");

    expect(result).toEqual({ captured: false, reason: "already-captured" });
    expect(prompts).toHaveLength(1);
    expect(await capturedFaqs()).toHaveLength(1);
  });

  it("measures the new FAQ's markdown, the form stored FAQs are embedded in", async () => {
    await capture(createHandler(), "trusted");

    expect(searches).toEqual([
      faqAdapter.createFaqContent(
        {
          question: "How do I publish a draft post?",
          status: "draft",
          sourceConversationId: CONVERSATION_ID,
          sourceMessageId: "m4",
          mergedMessageIds: [],
        },
        "Open the post in Studio and choose Publish.",
      ),
    ]);
  });

  it("merges a repeated question into the FAQ of the same visibility", async () => {
    await seedMatch("shared", 0.08);

    const result = await capture(createHandler(), "trusted");

    expect(result).toEqual({
      captured: true,
      entityId: "faq-old",
      merged: true,
    });
    const faqs = await capturedFaqs();
    expect(faqs).toHaveLength(1);
    expect(faqs[0]?.metadata.asked).toBe(2);
    const parsed = faqAdapter.parseFaqContent(faqs[0]?.content ?? "");
    expect(parsed.frontmatter.mergedMessageIds).toEqual(["m4"]);
    expect(parsed.answer).toBe("Choose Publish in Studio.");
    expect(parsed.alternatives).toEqual([
      {
        messageId: "m4",
        answer: "Open the post in Studio and choose Publish.",
      },
    ]);
  });

  it("records no candidate when the merging answer matches the FAQ's", async () => {
    await seedMatch("shared", 0.08);
    classification = { ...accepted, answer: "Choose Publish in Studio." };

    await capture(createHandler(), "trusted");

    const [faq] = await capturedFaqs();
    const parsed = faqAdapter.parseFaqContent(faq?.content ?? "");
    expect(parsed.frontmatter.mergedMessageIds).toEqual(["m4"]);
    expect(parsed.alternatives).toEqual([]);
  });

  for (const [existing, level] of [
    ["public", "admin"],
    ["restricted", "public"],
  ] as const) {
    it(`never merges a ${level} turn into a ${existing} FAQ`, async () => {
      await seedMatch(existing, 0.05);

      const result = await capture(createHandler(), level);

      expect(result).toEqual({
        captured: true,
        entityId: "how-do-i-publish-a-draft-post-m4",
        merged: false,
      });
      expect(await capturedFaqs()).toHaveLength(2);
    });
  }

  it("applies the configured same-question distance", async () => {
    await seedMatch("restricted", 0.3);

    const result = await capture(createHandler(transcript, 0.35), "admin");

    expect(result).toMatchObject({ entityId: "faq-old", merged: true });
  });

  it("keeps a weak match as a separate FAQ", async () => {
    await seedMatch("restricted", 0.3);

    const result = await capture(createHandler(), "admin");

    expect(result).toMatchObject({
      entityId: "how-do-i-publish-a-draft-post-m4",
      merged: false,
    });
  });

  it("merges each answer once", async () => {
    await seedMatch("restricted", 0.08);
    const handler = createHandler();
    await capture(handler, "admin");

    const result = await capture(handler, "admin");

    expect(result).toEqual({ captured: false, reason: "already-captured" });
    expect(prompts).toHaveLength(1);
    const [faq] = await capturedFaqs();
    expect(faq?.metadata.asked).toBe(2);
  });

  it("keeps a merge that lands while this one is writing", async () => {
    await seedMatch("restricted", 0.08);
    const service = context.entityService;
    const update = service.updateEntity.bind(service);
    let interleaved = false;
    service.updateEntity = async (request): ReturnType<typeof update> => {
      if (!interleaved) {
        interleaved = true;
        // Another capture job merges its reply into the same FAQ first.
        const [current] = await capturedFaqs();
        if (!current) throw new Error("Expected the seeded FAQ");
        const parsed = faqAdapter.parseFaqContent(current.content);
        const frontmatter = {
          ...parsed.frontmatter,
          mergedMessageIds: ["other"],
        };
        await update({
          entity: {
            ...current,
            content: faqAdapter.createFaqContent(frontmatter, parsed.answer),
            metadata: faqMetadata(frontmatter),
          },
        });
      }
      return update(request);
    };

    const result = await capture(createHandler(), "admin");

    expect(result).toEqual({
      captured: true,
      entityId: "faq-old",
      merged: true,
    });
    const [faq] = await capturedFaqs();
    const parsed = faqAdapter.parseFaqContent(faq?.content ?? "");
    expect(parsed.frontmatter.mergedMessageIds).toEqual(["other", "m4"]);
    expect(faq?.metadata.asked).toBe(3);
  });

  it("finds a reply that newer messages pushed far back", async () => {
    const long = Array.from({ length: 80 }, (_, index) =>
      message(
        `m${index + 1}`,
        index % 2 === 0 ? "user" : "assistant",
        index === 18
          ? "how do I publish a draft post?"
          : `message ${index + 1}`,
      ),
    );

    const result = await capture(createHandler(long), "admin", "m20", 20);

    expect(result).toMatchObject({
      captured: true,
      entityId: "how-do-i-publish-a-draft-post-m20",
    });
    expect(prompts[0]).toContain("how do I publish a draft post?");
    expect(fetches).toEqual([{ range: { start: 1, end: 30 } }]);
  });

  it("falls back to a generic prefix for a question with no latin letters", async () => {
    classification = {
      reusable: true,
      question: "如何发布草稿？",
      answer: "在 Studio 中选择发布。",
    };

    const result = await capture(createHandler(), "admin");

    expect(result).toMatchObject({ entityId: "faq-m4" });
  });

  it("keeps a close look-alike separate when the check says the questions differ", async () => {
    await seedMatch("restricted", 0.08);
    sameVerdict = false;

    const result = await capture(createHandler(), "admin");

    expect(result).toMatchObject({
      entityId: "how-do-i-publish-a-draft-post-m4",
      merged: false,
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toContain("How can I publish a draft?");
    expect(checks[0]).toContain("How do I publish a draft post?");
    expect(await capturedFaqs()).toHaveLength(2);
  });

  it("asks nothing extra when no FAQ is close", async () => {
    await capture(createHandler(), "admin");

    expect(checks).toEqual([]);
  });
});
