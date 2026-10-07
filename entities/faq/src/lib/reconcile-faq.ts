import { sdkErrorSchema, type ContentVisibility } from "@brains/sdk/entities";
import { parseFaqContent } from "./faq-content";
import { prepareFaqMerge } from "./faq-merge";
import type { FaqEntity } from "../schemas/faq";

export type FaqReconcileResult =
  | { outcome: "folded"; into: string }
  | { outcome: "kept" | "unique" | "published" | "gone" | "changed" };

export interface FaqReconcileEdit {
  readonly entity: Readonly<FaqEntity>;
  readonly version: string;
}

/** The algorithm needs issued edits and one atomic fold, never storage access. */
export interface FaqReconciliation<TEdit extends FaqReconcileEdit> {
  read(id: string, visibility: ContentVisibility): Promise<TEdit | null>;
  findSame(request: {
    content: string;
    visibility: ContentVisibility;
    excludeIds: string[];
  }): Promise<FaqEntity | undefined>;
  fold(source: TEdit, target: TEdit, entity: FaqEntity): Promise<void>;
}

function foldsInto(
  faq: Readonly<FaqEntity>,
  other: Readonly<FaqEntity>,
): boolean {
  if (other.metadata.status === "published") return true;
  return faq.created === other.created
    ? faq.id > other.id
    : faq.created > other.created;
}

/** Pins the source, refreshes only the originally eligible destination, never resurrects. */
export async function reconcileFaq<TEdit extends FaqReconcileEdit>(
  entityId: string,
  deps: FaqReconciliation<TEdit>,
): Promise<FaqReconcileResult> {
  const source = await deps.read(entityId, "restricted");
  if (!source) return { outcome: "gone" };
  const faq = source.entity;
  if (faq.metadata.status === "published") return { outcome: "published" };
  const same = await deps.findSame({
    content: faq.content,
    visibility: faq.visibility,
    excludeIds: [faq.id],
  });
  if (!same) return { outcome: "unique" };
  const question = parseFaqContent(same.content).frontmatter.question;
  const { frontmatter, answer, alternatives } = parseFaqContent(faq.content);
  const attempt = async (attemptsLeft: number): Promise<FaqReconcileResult> => {
    const target = await deps.read(same.id, faq.visibility);
    if (!target) return { outcome: "changed" };
    const destination = target.entity;
    if (
      destination.visibility !== faq.visibility ||
      parseFaqContent(destination.content).frontmatter.question !== question
    )
      return { outcome: "changed" };
    if (!foldsInto(faq, destination)) return { outcome: "kept" };
    try {
      await deps.fold(
        source,
        target,
        prepareFaqMerge(destination, {
          asks: frontmatter.asked,
          alternatives: [{ answer }, ...alternatives],
        }),
      );
    } catch (error) {
      if (sdkErrorSchema.safeParse(error).data?.code !== "conflict")
        throw error;
      const current = await deps.read(faq.id, faq.visibility);
      if (current?.version !== source.version) return { outcome: "changed" };
      if (attemptsLeft <= 1)
        throw new Error(`FAQ ${same.id} kept changing during fold`, {
          cause: error,
        });
      return attempt(attemptsLeft - 1);
    }
    return { outcome: "folded", into: destination.id };
  };
  return attempt(3);
}
