import type { EntityPluginContext } from "@brains/plugins";
import { BaseJobHandler, internalFullScope } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { faqAdapter } from "../adapters/faq-adapter";
import { findSameFaq, mergeIntoFaq, type FaqStoreDeps } from "../lib/faq-store";
import { faqSchema, type FaqEntity } from "../schemas/faq";

export const faqReconcileJobSchema: z.ZodObject<{ entityId: z.ZodString }> =
  z.object({ entityId: z.string() });

export type FaqReconcileJobData = z.output<typeof faqReconcileJobSchema>;

export type FaqReconcileResult =
  | { outcome: "folded"; into: string }
  | { outcome: "kept" | "unique" | "published" | "gone" };

export interface FaqReconcileDeps extends FaqStoreDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "getEntity" | "updateEntity" | "deleteEntity"
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
    const faq = await this.deps.entityService.getEntity(
      {
        entityType: "faq",
        id: data.entityId,
        visibilityScope: internalFullScope("faq reconciliation"),
      },
      faqSchema,
    );
    if (!faq) return { outcome: "gone" };
    if (faq.metadata.status === "published") return { outcome: "published" };

    const same = await findSameFaq(this.deps, {
      content: faq.content,
      visibility: faq.visibility,
      excludeIds: [faq.id],
    });
    if (!same) return { outcome: "unique" };
    if (!foldsInto(faq, same)) return { outcome: "kept" };

    const { frontmatter, answer, alternatives } = faqAdapter.parseFaqContent(
      faq.content,
    );
    const moved = await mergeIntoFaq(this.deps, same, {
      asks: frontmatter.asked,
      alternatives: [{ answer }, ...alternatives],
    });
    if (!moved) return { outcome: "unique" };

    await this.deps.entityService.deleteEntity({
      entityType: "faq",
      id: faq.id,
    });
    return { outcome: "folded", into: same.id };
  }
}
