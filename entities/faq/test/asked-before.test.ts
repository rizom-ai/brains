import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  FaqPlugin,
  SAME_QUESTION_CHECK,
  answerAskedBefore,
  faqAdapter,
  faqMetadata,
  faqSchema,
  type FaqStoreDeps,
} from "../src";

// A visitor's question a published FAQ already answers is answered from it,
// with the sources the FAQ kept, and counts as one more asking.
describe("answering a question asked before", () => {
  let context: EntityPluginContext;
  interface Distance {
    entityId: string;
    entityType: string;
    distance: number;
  }
  let distances: Distance[];
  let sameVerdict: boolean;
  let checks: string[];
  let queries: string[];

  const sources = [
    {
      id: "network-piece:plc-peer--post--3kabc",
      title: "Handoffs between teams",
      url: "https://becca.rizom.ai/essays/handoffs",
      excerpt: "Before anyone leaves a task we write three things down.",
      brain: { name: "Becca", url: "https://becca.rizom.ai/" },
    },
  ];

  function deps(): FaqStoreDeps {
    return {
      entityService: context.entityService,
      sameQuestionDistance: 0.25,
      searchWithDistances: async (request): Promise<Distance[]> => {
        queries.push(request.query);
        return distances;
      },
      ai: {
        generateObject: async <T>(
          prompt: string,
          schema: { parse(value: unknown): T },
        ): Promise<{ object: T }> => {
          if (!prompt.includes(SAME_QUESTION_CHECK)) throw new Error(prompt);
          checks.push(prompt);
          return { object: schema.parse({ same: sameVerdict }) };
        },
      },
    };
  }

  async function seed(
    id: string,
    status: "draft" | "published",
    visibility: ContentVisibility = "public",
    review?: "source-withdrawn",
  ): Promise<void> {
    const frontmatter = {
      question: "How does Rizom keep memory?",
      status,
      asked: 3,
      sources,
      ...(review ? { review } : {}),
    };
    await context.entityService.createEntity({
      entity: {
        id,
        entityType: "faq",
        content: faqAdapter.createFaqContent(
          frontmatter,
          "In the brains of the people who hold it.",
        ),
        visibility,
        metadata: faqMetadata(frontmatter),
      },
    });
    distances = [{ entityId: id, entityType: "faq", distance: 0.1 }];
  }

  async function asked(id: string): Promise<number | undefined> {
    const faq = await context.entityService.getEntity(
      { entityType: "faq", id, visibilityScope: "public" },
      faqSchema,
    );
    return faq?.metadata.asked;
  }

  beforeEach(async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-asked-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());
    context = harness.getEntityContext("faq");
    distances = [];
    sameVerdict = true;
    checks = [];
    queries = [];
  });

  it("answers from the published FAQ, with its sources, and counts the ask", async () => {
    await seed("how-does-rizom-keep-memory", "published");
    const response = await answerAskedBefore(deps(), {
      question: "how does rizom remember things?",
    });
    expect(queries).toEqual(["how does rizom remember things?"]);
    expect(checks).toHaveLength(1);
    expect(response).toEqual({
      hit: {
        faqId: "how-does-rizom-keep-memory",
        answer: "In the brains of the people who hold it.",
        sources: [
          {
            id: "network-piece:plc-peer--post--3kabc",
            source: "network-piece",
            entityType: "network-piece",
            entityId: "plc-peer--post--3kabc",
            title: "Handoffs between teams",
            url: "https://becca.rizom.ai/essays/handoffs",
            excerpt: "Before anyone leaves a task we write three things down.",
            brain: { name: "Becca", url: "https://becca.rizom.ai/" },
          },
        ],
      },
    });
    expect(await asked("how-does-rizom-keep-memory")).toBe(4);
  });

  it("never answers from a draft, and asks the model nothing about one", async () => {
    await seed("draft-faq", "draft");
    expect(await answerAskedBefore(deps(), { question: "memory?" })).toEqual(
      {},
    );
    expect(checks).toHaveLength(0);
    expect(await asked("draft-faq")).toBe(3);
  });

  it("leaves a FAQ awaiting the owner's review to the model, and asks nothing about it", async () => {
    await seed("under-review", "published", "public", "source-withdrawn");
    expect(await answerAskedBefore(deps(), { question: "memory?" })).toEqual(
      {},
    );
    expect(checks).toHaveLength(0);
    expect(await asked("under-review")).toBe(3);
  });

  it("answers nothing when the nearest FAQ asks a different question", async () => {
    await seed("how-does-rizom-keep-memory", "published");
    sameVerdict = false;
    expect(
      await answerAskedBefore(deps(), { question: "How do I forget?" }),
    ).toEqual({});
    expect(await asked("how-does-rizom-keep-memory")).toBe(3);
  });

  it("answers nothing when no FAQ is near", async () => {
    await seed("how-does-rizom-keep-memory", "published");
    distances = [
      {
        entityId: "how-does-rizom-keep-memory",
        entityType: "faq",
        distance: 0.6,
      },
    ];
    expect(await answerAskedBefore(deps(), { question: "Hello?" })).toEqual({});
    expect(checks).toHaveLength(0);
  });
});
