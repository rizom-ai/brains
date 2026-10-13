import type { EntityPluginContext } from "@brains/plugins";
import {
  BaseJobHandler,
  internalFullScope,
  EntityWriteConflictError,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { faqAdapter } from "../adapters/faq-adapter";
import {
  findSameFaq,
  prepareFaqMerge,
  type FaqStoreDeps,
} from "../lib/faq-store";
import { faqSchema, type FaqEntity } from "../schemas/faq";

export const faqReconcileJobSchema: z.ZodObject<{ entityId: z.ZodString }> =
  z.object({ entityId: z.string() });

export type FaqReconcileJobData = z.output<typeof faqReconcileJobSchema>;

export type FaqReconcileResult =
  | { outcome: "folded"; into: string }
  | { outcome: "kept" | "unique" | "published" | "gone" | "changed" };

export interface FaqReconcileDeps extends FaqStoreDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "getEntity" | "updateEntity" | "getEntityWriteSnapshot" | "foldEntity"
  >;
}

/** Whether `faq` is the one of a same-question pair that folds away. */
function foldsInto(faq: FaqEntity, other: FaqEntity): boolean {
  if (other.metadata.status === "published") return true;
  return faq.created === other.created
    ? faq.id > other.id
    : faq.created > other.created;
}

/**
 * Runs once a FAQ's embedding exists, when it can first be found by meaning.
 * Two captures of one question moments apart both create a FAQ, because
 * neither could see the other; this folds the duplicate draft into the FAQ
 * that stays. A draft folds into a published FAQ; of two drafts the newer
 * folds, so both pair members' jobs agree. A published FAQ never folds.
 */
export class FaqReconcileHandler extends BaseJobHandler<
  "faq-reconcile",
  FaqReconcileJobData,
  FaqReconcileResult
> {
  private readonly deps: FaqReconcileDeps;

  constructor(logger: Logger, deps: FaqReconcileDeps) {
    super(logger, {
      schema: faqReconcileJobSchema,
      jobTypeName: "faq-reconcile",
    });
    this.deps = deps;
  }

  async process(
    data: FaqReconcileJobData,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<FaqReconcileResult> {
    const source = await this.deps.entityService.getEntityWriteSnapshot({
      entityType: "faq",
      id: data.entityId,
      visibilityScope: internalFullScope("faq reconciliation"),
    });
    if (!source) return { outcome: "gone" };
    const faq = faqSchema.parse(source.entity);
    if (faq.metadata.status === "published") return { outcome: "published" };

    const same = await findSameFaq(this.deps, {
      content: faq.content,
      visibility: faq.visibility,
      excludeIds: [faq.id],
    });
    if (!same) return { outcome: "unique" };
    const question = faqAdapter.parseFaqContent(same.content).frontmatter
      .question;
    const { frontmatter, answer, alternatives } = faqAdapter.parseFaqContent(
      faq.content,
    );
    const attempt = async (
      attemptsLeft: number,
    ): Promise<FaqReconcileResult> => {
      // Refresh only the same question and visibility that semantic matching
      // admitted. Concurrent answer/count edits can still be merged safely.
      const target = await this.deps.entityService.getEntityWriteSnapshot({
        entityType: "faq",
        id: same.id,
        visibilityScope: faq.visibility,
      });
      if (!target) return { outcome: "changed" };
      const destination = faqSchema.parse(target.entity);
      if (
        destination.visibility !== faq.visibility ||
        faqAdapter.parseFaqContent(destination.content).frontmatter.question !==
          question
      )
        return { outcome: "changed" };
      if (!foldsInto(faq, destination)) return { outcome: "kept" };
      try {
        await this.deps.entityService.foldEntity({
          source: {
            entityType: "faq",
            id: faq.id,
            expectedRevision: source.revision,
          },
          targetRevision: target.revision,
          entity: prepareFaqMerge(destination, {
            asks: frontmatter.asked,
            alternatives: [{ answer }, ...alternatives],
          }),
        });
      } catch (error) {
        // Never compensate a possible committed fold by recreating its source.
        if (!(error instanceof EntityWriteConflictError)) throw error;
        const currentSource =
          await this.deps.entityService.getEntityWriteSnapshot({
            entityType: "faq",
            id: faq.id,
            visibilityScope: faq.visibility,
          });
        if (currentSource?.revision !== source.revision)
          return { outcome: "changed" };
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
}
