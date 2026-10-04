import type {
  EntityPluginContext,
  InboxAction,
  InboxActor,
  InboxItem,
  InboxItemDetail,
  InboxSource,
} from "@brains/plugins";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";
import {
  faqSchema,
  type FaqAlternative,
  type FaqEntity,
  type FaqFrontmatter,
} from "../schemas/faq";

type FaqInboxContext = Pick<EntityPluginContext, "entityService"> & {
  permissions: Pick<
    EntityPluginContext["permissions"],
    "assertEntityActionAllowed"
  >;
};

interface ParsedFaq {
  entity: FaqEntity;
  frontmatter: FaqFrontmatter;
  answer: string;
  alternatives: FaqAlternative[];
}

const USE_ALTERNATIVE = /^use-alternative-([1-9]\d*)$/;
/** The Inbox allows ten actions; one is "Keep current answer". */
const MAX_ALTERNATIVES = 9;

function requireAdmin(actor: InboxActor): void {
  if (actor.permissionLevel !== "admin")
    throw new Error("FAQ inbox requires admin permission");
}

function parse(entity: FaqEntity): ParsedFaq {
  return { entity, ...faqAdapter.parseFaqContent(entity.content) };
}

function asked(count: number): string {
  return `Asked ${count} ${count === 1 ? "time" : "times"}.`;
}

function toItem({ entity, frontmatter, alternatives }: ParsedFaq): InboxItem[] {
  const base = {
    id: entity.id,
    title: frontmatter.question.slice(0, 160),
    receivedAt: entity.updated,
    urgency: "normal" as const,
    entityRef: { entityType: "faq", entityId: entity.id },
  };
  if (frontmatter.status === "draft")
    return [
      {
        ...base,
        summary: `New question. ${asked(frontmatter.asked)}`,
        actions: [
          { id: "publish", label: "Publish" },
          { id: "decline", label: "Decline", confirm: true },
        ],
      },
    ];
  if (frontmatter.review === "source-withdrawn")
    return [
      {
        ...base,
        summary: `A cited piece left the network. ${asked(frontmatter.asked)}`,
        actions: [
          { id: "keep-published", label: "Keep the answer" },
          { id: "unpublish", label: "Take it down", confirm: true },
        ],
      },
    ];
  if (alternatives.length === 0) return [];
  const actions: InboxAction[] = [
    ...alternatives.slice(0, MAX_ALTERNATIVES).map((_alternative, index) => ({
      id: `use-alternative-${index + 1}`,
      label: `Use alternative ${index + 1}`,
    })),
    { id: "keep-current", label: "Keep current answer" },
  ];
  return [
    {
      ...base,
      summary: `Answered differently. ${asked(frontmatter.asked)}`,
      actions,
    },
  ];
}

/**
 * FAQs that need the owner: a captured question to publish or decline, and a
 * published FAQ that a repeated question answered differently, to settle on
 * one answer. Listing is an internal pull; every Inbox surface enforces the
 * admin floor, and details and actions check the actor here too.
 */
export class FaqInboxSource implements InboxSource {
  readonly sourceId: string = "faq";
  readonly displayName: string = "FAQs";
  private readonly context: FaqInboxContext;

  constructor(context: FaqInboxContext) {
    this.context = context;
  }

  async list(): Promise<InboxItem[]> {
    const faqs = await this.context.entityService.listEntities(
      {
        entityType: "faq",
        options: {
          limit: 1000,
          sortFields: [{ field: "updated", direction: "desc" }],
          filter: { visibilityScope: "restricted" },
        },
      },
      faqSchema,
    );
    return faqs.flatMap((faq) => toItem(parse(faq)));
  }

  async resolveDetail(
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail> {
    requireAdmin(actor);
    signal.throwIfAborted();
    const { frontmatter, answer, alternatives } = await this.load(itemId);
    signal.throwIfAborted();
    const sources = frontmatter.sources ?? [];
    const sections = [
      frontmatter.question,
      `${frontmatter.status === "draft" ? "Drafted answer" : "Current answer"}:\n${answer}`,
      ...alternatives.map(
        (alternative, index) =>
          `Alternative ${index + 1}:\n${alternative.answer}`,
      ),
      ...(sources.length > 0
        ? [
            `Sources:\n${sources
              .map((source) =>
                [source.brain?.name, source.title, source.url]
                  .filter(Boolean)
                  .join(" — "),
              )
              .join("\n")}`,
          ]
        : []),
    ];
    return { kind: "plain", text: sections.join("\n\n"), truncated: false };
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void> {
    requireAdmin(actor);
    const faq = await this.load(itemId);
    if (actionId === "decline") {
      this.allow("delete", actor);
      const deleted = await this.context.entityService.deleteEntity({
        entityType: "faq",
        id: faq.entity.id,
        options: { expectedContentHash: faq.entity.contentHash },
      });
      if (!deleted) throw new Error("The FAQ changed meanwhile; try again");
      return;
    }

    if (actionId === "keep-published" || actionId === "unpublish") {
      this.allow("update", actor);
      if (faq.frontmatter.review !== "source-withdrawn")
        throw new Error("Invalid FAQ inbox action");
      const { review: _review, ...rest } = faq.frontmatter;
      const settled: FaqFrontmatter = {
        ...rest,
        status: actionId === "unpublish" ? "draft" : rest.status,
      };
      const reviewed = await this.context.entityService.updateEntity({
        entity: {
          ...faq.entity,
          content: faqAdapter.createFaqContent(
            settled,
            faq.answer,
            faq.alternatives,
          ),
          metadata: faqMetadata(settled),
        },
        options: { expectedContentHash: faq.entity.contentHash },
      });
      if (reviewed.skipped)
        throw new Error("The FAQ changed meanwhile; try again");
      return;
    }
    // Moving a draft to `published` is the publish entity action.
    this.allow(actionId === "publish" ? "publish" : "update", actor);
    const chosen = this.chosenAnswer(faq, actionId);
    const frontmatter: FaqFrontmatter = {
      ...faq.frontmatter,
      status: actionId === "publish" ? "published" : faq.frontmatter.status,
    };
    const result = await this.context.entityService.updateEntity({
      entity: {
        ...faq.entity,
        // Settling drops the alternatives; publishing keeps them for later.
        content: faqAdapter.createFaqContent(
          frontmatter,
          chosen,
          actionId === "publish" ? faq.alternatives : [],
        ),
        metadata: faqMetadata(frontmatter),
      },
      options: { expectedContentHash: faq.entity.contentHash },
    });
    if (result.skipped) throw new Error("The FAQ changed meanwhile; try again");
  }

  private chosenAnswer(faq: ParsedFaq, actionId: string): string {
    if (actionId === "publish" && faq.frontmatter.status === "draft")
      return faq.answer;
    if (faq.frontmatter.status !== "published" || faq.alternatives.length === 0)
      throw new Error("Invalid FAQ inbox action");
    if (actionId === "keep-current") return faq.answer;
    const position = USE_ALTERNATIVE.exec(actionId)?.[1];
    const alternative =
      position === undefined
        ? undefined
        : faq.alternatives[Number(position) - 1];
    if (!alternative) throw new Error("Invalid FAQ inbox action");
    return alternative.answer;
  }

  private allow(
    action: "update" | "delete" | "publish",
    actor: InboxActor,
  ): void {
    this.context.permissions.assertEntityActionAllowed("faq", action, {
      userPermissionLevel: actor.permissionLevel,
    });
  }

  private async load(itemId: string): Promise<ParsedFaq> {
    const faq = await this.context.entityService.getEntity(
      { entityType: "faq", id: itemId, visibilityScope: "restricted" },
      faqSchema,
    );
    if (!faq) throw new Error("FAQ not found");
    return parse(faq);
  }
}
