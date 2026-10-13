import { BaseJobHandler } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import {
  completeWithdrawal,
  type SourceWithdrawals,
} from "../lib/source-withdrawals";
import type { WithdrawalEntities } from "../lib/stale-sources";

export const faqSourceReviewSchema: z.ZodObject<{
  sourceId: z.ZodString;
  withdrawalId: z.ZodString;
}> = z.object({ sourceId: z.string().min(1), withdrawalId: z.string().min(1) });
type SourceReview = z.infer<typeof faqSourceReviewSchema>;

export class FaqSourceReviewHandler extends BaseJobHandler<
  "faq-source-review",
  SourceReview,
  { reviewed: string[] }
> {
  private readonly entities: WithdrawalEntities;
  private readonly withdrawals: SourceWithdrawals;
  constructor(
    logger: Logger,
    entities: WithdrawalEntities,
    withdrawals: SourceWithdrawals,
  ) {
    super(logger, {
      schema: faqSourceReviewSchema,
      jobTypeName: "faq-source-review",
    });
    this.entities = entities;
    this.withdrawals = withdrawals;
  }

  public async process(
    data: SourceReview,
    _jobId: string,
    _progress: ProgressReporter,
  ): Promise<{ reviewed: string[] }> {
    return {
      reviewed: await completeWithdrawal(
        this.entities,
        this.withdrawals,
        data.sourceId,
        data.withdrawalId,
      ),
    };
  }
}
