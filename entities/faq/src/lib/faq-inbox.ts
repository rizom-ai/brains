import type {
  EntityDefinition,
  EntityInboxDeclaration,
} from "@brains/sdk/entities";
import type {
  InboxAction,
  InboxItem,
} from "@brains/sdk/internal/service-runtime";
import { faqRecord, readFaq } from "./faq-body";
import {
  faqSchema,
  type FaqAlternative,
  type FaqEntity,
  type FaqFrontmatter,
  type FaqSource,
  type faqMetadataSchema,
} from "../schemas/faq";

type FaqDefinition = EntityDefinition<"faq", typeof faqMetadataSchema>;

interface ParsedFaq {
  entity: FaqEntity;
  frontmatter: FaqFrontmatter;
  answer: string;
  sources: FaqSource[];
  alternatives: FaqAlternative[];
}

const USE_ALTERNATIVE = /^use-alternative-([1-9]\d*)$/;
/** The Inbox allows ten actions; one is "Keep current answer". */
const MAX_ALTERNATIVES = 9;

function parse(record: unknown): ParsedFaq {
  const entity = faqSchema.parse(record);
  return { entity, ...readFaq(entity) };
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

function chosenAnswer(faq: ParsedFaq, actionId: string): string {
  if (actionId === "publish" && faq.frontmatter.status === "draft")
    return faq.answer;
  if (faq.frontmatter.status !== "published" || faq.alternatives.length === 0)
    throw new Error("Invalid FAQ inbox action");
  if (actionId === "keep-current") return faq.answer;
  const position = USE_ALTERNATIVE.exec(actionId)?.[1];
  const alternative =
    position === undefined ? undefined : faq.alternatives[Number(position) - 1];
  if (!alternative) throw new Error("Invalid FAQ inbox action");
  return alternative.answer;
}

/**
 * FAQs that need the owner: a captured question to publish or decline, and a
 * published FAQ that a repeated question answered differently, to settle on
 * one answer. The Inbox opens and acts as the operator, at their visibility.
 */
export const faqInbox: EntityInboxDeclaration<FaqDefinition> = {
  sourceId: "faq",
  displayName: "FAQs",
  list: async ({ records }) =>
    (
      await records.list({
        limit: 1000,
        sort: [{ field: "updated", direction: "desc" }],
      })
    ).flatMap((record) => toItem(parse(record))),
  resolveDetail: async (itemId, { records, signal }) => {
    signal.throwIfAborted();
    const record = await records.get(itemId);
    if (!record) throw new Error("FAQ not found");
    const { frontmatter, answer, alternatives, sources } = parse(record);
    signal.throwIfAborted();
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
  act: async (itemId, actionId, { records, edits }) => {
    const record = await records.get(itemId);
    if (!record) throw new Error("FAQ not found");
    if (actionId === "decline") {
      await edits.delete(record);
      return;
    }
    const faq = parse(record);
    const chosen = chosenAnswer(faq, actionId);
    const publishing = actionId === "publish";
    const frontmatter: FaqFrontmatter = {
      ...faq.frontmatter,
      status: publishing ? "published" : faq.frontmatter.status,
    };
    // Settling drops the alternatives; publishing keeps them for later.
    const change = faqRecord(
      frontmatter,
      chosen,
      publishing ? faq.alternatives : [],
      faq.sources,
    );
    // Moving a draft to `published` is the publish entity action.
    await (publishing
      ? edits.publish(record, change)
      : edits.update(record, change));
  },
};
