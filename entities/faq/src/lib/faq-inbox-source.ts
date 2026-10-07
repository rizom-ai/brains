import type {
  EntityInboxDeclaration,
  InboxAction,
  InboxActor,
  InboxItem,
} from "@brains/sdk/entities";
import { faq } from "../faq-entity";
import { createFaqContent, parseFaqContent, faqMetadata } from "./faq-content";
import {
  faqSchema,
  type FaqAlternative,
  type FaqEntity,
  type FaqFrontmatter,
} from "../schemas/faq";

interface ParsedFaq {
  entity: FaqEntity;
  frontmatter: FaqFrontmatter;
  answer: string;
  alternatives: FaqAlternative[];
}
const USE_ALTERNATIVE = /^use-alternative-([1-9]\d*)$/;
/** Ten Inbox actions, including "Keep current answer". */
const MAX_ALTERNATIVES = 9;
function requireAdmin(actor: InboxActor): void {
  if (actor.permissionLevel !== "admin")
    throw new Error("FAQ inbox requires admin permission");
}
function parse(entity: FaqEntity): ParsedFaq {
  return { entity, ...parseFaqContent(entity.content) };
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
function chosenAnswer(value: ParsedFaq, actionId: string): string {
  if (actionId === "publish" && value.frontmatter.status === "draft")
    return value.answer;
  if (
    value.frontmatter.status !== "published" ||
    value.alternatives.length === 0
  )
    throw new Error("Invalid FAQ inbox action");
  if (actionId === "keep-current") return value.answer;
  const position = Number(USE_ALTERNATIVE.exec(actionId)?.[1]);
  const alternative =
    position <= MAX_ALTERNATIVES ? value.alternatives[position - 1] : undefined;
  if (!alternative) throw new Error("Invalid FAQ inbox action");
  return alternative.answer;
}

/** Ownership, live caller policy, full CAS and attribution are host capabilities. */
export const faqInbox: EntityInboxDeclaration = {
  sourceId: "faq",
  displayName: "FAQs",
  list: async (context) => {
    const rows = await context.entities.listEntities(
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
    return rows.flatMap((row) => toItem(parse(row)));
  },
  resolveDetail: async (context, itemId, actor, signal) => {
    requireAdmin(actor);
    signal.throwIfAborted();
    const row = await context.entities.getEntity(
      { entityType: "faq", id: itemId, visibilityScope: "restricted" },
      faqSchema,
    );
    signal.throwIfAborted();
    if (!row) throw new Error("FAQ not found");
    const { frontmatter, answer, alternatives } = parse(row);
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
  },
  act: async (context, itemId, actionId, actor) => {
    requireAdmin(actor);
    const edit = await context.edits.read(faq, itemId);
    if (!edit) throw new Error("FAQ not found");
    const value = parse(faqSchema.parse(edit.entity));
    if (actionId === "decline") {
      if (value.frontmatter.status !== "draft")
        throw new Error("Invalid FAQ inbox action");
      await context.edits.delete(faq, edit);
      return;
    }
    if (actionId === "keep-published" || actionId === "unpublish") {
      if (value.frontmatter.review !== "source-withdrawn")
        throw new Error("Invalid FAQ inbox action");
      const { review: _review, ...rest } = value.frontmatter;
      const settled: FaqFrontmatter = {
        ...rest,
        status: actionId === "unpublish" ? "draft" : rest.status,
      };
      await context.edits.replace(faq, edit, {
        ...edit.entity,
        content: createFaqContent(settled, value.answer, value.alternatives),
        metadata: faqMetadata(settled),
      });
      return;
    }
    const chosen = chosenAnswer(value, actionId);
    const frontmatter: FaqFrontmatter = {
      ...value.frontmatter,
      status: actionId === "publish" ? "published" : value.frontmatter.status,
      // Historical alternatives carry no provenance; never attribute a different
      // answer to the original answer's sources.
      ...(USE_ALTERNATIVE.test(actionId) ? { sources: [] } : {}),
    };
    await context.edits.replace(faq, edit, {
      ...edit.entity,
      content: createFaqContent(
        frontmatter,
        chosen,
        actionId === "publish" ? value.alternatives : [],
      ),
      metadata: faqMetadata(frontmatter),
    });
  },
};
