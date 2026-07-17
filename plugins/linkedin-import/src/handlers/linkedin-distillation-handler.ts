import { BaseJobHandler, type IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import {
  applyProfileNarrativeProposal,
  profileNarrativeProposalSchema,
  type ProfileNarrativeProposal,
} from "../lib/profile-distillation";
import { profileContentDigest } from "../lib/profile-import-digest";

export interface LinkedInDistillationJobData {
  proposal: ProfileNarrativeProposal;
  expectedProfileDigest: string;
}

export const linkedinDistillationJobSchema: z.ZodType<LinkedInDistillationJobData> =
  z
    .object({
      proposal: profileNarrativeProposalSchema,
      expectedProfileDigest: z.string().length(64),
    })
    .strict();

export interface LinkedInDistillationJobResult {
  updated: boolean;
  changedFields: Array<"intro" | "story" | "tagline">;
}

export class LinkedInDistillationJobHandler extends BaseJobHandler<
  "linkedin-profile-distill",
  LinkedInDistillationJobData,
  LinkedInDistillationJobResult
> {
  private readonly entityService: IEntityService;

  constructor(logger: Logger, entityService: IEntityService) {
    super(logger, {
      schema: linkedinDistillationJobSchema,
      jobTypeName: "linkedin-profile-distill",
    });
    this.entityService = entityService;
  }

  async process(
    data: LinkedInDistillationJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<LinkedInDistillationJobResult> {
    await this.reportProgress(progressReporter, {
      progress: 20,
      message: "Validating reviewed profile narrative",
    });

    const profile = await this.entityService.getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    });
    if (!profile) throw new Error("Anchor profile not found");
    if (profileContentDigest(profile.content) !== data.expectedProfileDigest) {
      throw new Error(
        "Anchor profile changed since narrative review; generate and review a new proposal",
      );
    }

    const applied = applyProfileNarrativeProposal(
      profile.content,
      data.proposal,
    );
    if (applied.changed) {
      const mutation = await this.entityService.updateEntity({
        entity: { ...profile, content: applied.content },
        ...(profile.contentHash
          ? { options: { expectedContentHash: profile.contentHash } }
          : {}),
      });
      if (mutation.skipped) {
        throw new Error(
          "Anchor profile changed during narrative update; generate and review a new proposal",
        );
      }
    }

    await this.reportProgress(progressReporter, {
      progress: 100,
      message: applied.changed
        ? "Reviewed profile narrative applied"
        : "Profile narrative already up to date",
    });

    return {
      updated: applied.changed,
      changedFields: applied.changedFields,
    };
  }

  protected override summarizeDataForLog(): Record<string, unknown> {
    return { proposalFields: ["tagline", "intro", "story"] };
  }
}
