import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type {
  ContentVisibility,
  EntityPluginContext,
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  FaqPlugin,
  faqAdapter,
  faqMetadata,
  faqSchema,
  registerFaqReviewWorkspace,
  type FaqAlternative,
  type FaqFrontmatter,
} from "../src";

const trusted: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "editor",
  actor: { kind: "user", userId: "editor" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

describe("FAQ review workspace", () => {
  let context: EntityPluginContext;
  let registration: StudioWorkspaceRegistration;

  async function seed(
    id: string,
    visibility: ContentVisibility,
    alternatives: FaqAlternative[],
  ): Promise<void> {
    const frontmatter: FaqFrontmatter = {
      question: `Question ${id}?`,
      status: "draft",
      sourceConversationId: "conv-1",
      sourceMessageId: `msg-${id}`,
      mergedMessageIds: alternatives.map(
        (alternative) => alternative.messageId,
      ),
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
    answer: string;
    alternatives: FaqAlternative[];
  }> {
    const faq = await context.entityService.getEntity(
      { entityType: "faq", id, visibilityScope: "restricted" },
      faqSchema,
    );
    const parsed = faqAdapter.parseFaqContent(faq?.content ?? "");
    return {
      answer: parsed.answer,
      alternatives: parsed.alternatives,
    };
  }

  function act(
    actionId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    return Promise.resolve(
      registration.actionHandler?.({ actionId, input }, trusted),
    ).then(
      (result) => result,
      (error: unknown) => error,
    );
  }

  beforeEach(async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-review-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());
    context = harness.getEntityContext("faq");
    context.messaging.subscribe<
      StudioWorkspaceRegistration,
      { workspaceUrl: string }
    >("studio:register-workspace", async (message) => {
      registration = message.payload;
      return {
        success: true,
        data: { workspaceUrl: "/studio/workspaces/faq-review" },
      };
    });
    await registerFaqReviewWorkspace(context);

    await seed("shared-faq", "shared", [
      { messageId: "msg-alt", answer: "A clearer answer." },
    ]);
    await seed("restricted-faq", "restricted", [
      { messageId: "msg-secret", answer: "Restricted alternative." },
    ]);
    await seed("settled-faq", "shared", []);
  });

  it("lists the FAQs with alternative answers the caller may see", async () => {
    const view = JSON.stringify(await registration.dataProvider(trusted));

    expect(view).toContain("Question shared-faq?");
    expect(view).toContain("A clearer answer.");
    expect(view).not.toContain("Question restricted-faq?");
    expect(view).not.toContain("Restricted alternative.");
    expect(view).not.toContain("Question settled-faq?");
  });

  it("uses a chosen alternative as the answer and clears the list", async () => {
    await act("use-answer", { entityId: "shared-faq", messageId: "msg-alt" });

    expect(await read("shared-faq")).toEqual({
      answer: "A clearer answer.",
      alternatives: [],
    });
  });

  it("keeps the current answer and clears the list", async () => {
    await act("keep-answer", { entityId: "shared-faq" });

    expect(await read("shared-faq")).toEqual({
      answer: "Answer shared-faq.",
      alternatives: [],
    });
  });

  it("changes nothing on a FAQ the caller cannot see", async () => {
    await act("use-answer", {
      entityId: "restricted-faq",
      messageId: "msg-secret",
    });
    await act("keep-answer", { entityId: "restricted-faq" });

    expect(await read("restricted-faq")).toEqual({
      answer: "Answer restricted-faq.",
      alternatives: [
        { messageId: "msg-secret", answer: "Restricted alternative." },
      ],
    });
  });
});
