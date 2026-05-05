import type { EntityPluginContext, JobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { getErrorMessage, z } from "@brains/utils";
import type { SummaryConfig } from "../schemas/summary";
import {
  SummaryProjector,
  type ProjectSummaryResult,
} from "../lib/summary-projector";

export const summaryProjectionJobDataSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("conversation"),
    conversationId: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    mode: z.literal("rebuild-all"),
    reason: z.string().optional(),
  }),
]);

export type SummaryProjectionJobData = z.infer<
  typeof summaryProjectionJobDataSchema
>;

export interface SummaryProjectionResult {
  projected: number;
  skipped: number;
  results: ProjectSummaryResult[];
}

export class SummaryProjectionHandler implements JobHandler<
  "summary:project",
  SummaryProjectionJobData,
  SummaryProjectionResult
> {
  private readonly projector: SummaryProjector;

  constructor(
    private readonly context: EntityPluginContext,
    private readonly logger: Logger,
    config: SummaryConfig,
  ) {
    this.projector = new SummaryProjector(context, logger, config);
  }

  public validateAndParse(data: unknown): SummaryProjectionJobData | null {
    const result = summaryProjectionJobDataSchema.safeParse(data);
    return result.success ? result.data : null;
  }

  public async process(
    data: SummaryProjectionJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SummaryProjectionResult> {
    try {
      if (data.mode === "conversation") {
        await progressReporter.report({
          progress: 0,
          message: `Projecting summary for ${data.conversationId}`,
        });

        const result = await this.projector.projectConversation(
          data.conversationId,
        );

        await progressReporter.report({
          progress: 100,
          message: result.skipped ? "Summary unchanged" : "Summary projected",
        });

        return {
          projected: result.skipped ? 0 : 1,
          skipped: result.skipped ? 1 : 0,
          results: [result],
        };
      }

      await progressReporter.report({
        progress: 0,
        message: "Rebuilding all conversation summaries",
      });

      const conversations = await this.context.conversations.list();
      const results: ProjectSummaryResult[] = [];

      for (const [index, conversation] of conversations.entries()) {
        results.push(await this.projector.projectConversation(conversation.id));
        await progressReporter.report({
          progress: Math.round(((index + 1) / conversations.length) * 100),
          message: `Projected ${index + 1}/${conversations.length} summaries`,
        });
      }

      return {
        projected: results.filter((result) => !result.skipped).length,
        skipped: results.filter((result) => result.skipped).length,
        results,
      };
    } catch (error) {
      this.logger.error("Summary projection job failed", {
        jobId,
        mode: data.mode,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
