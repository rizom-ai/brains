import { BaseJobHandler } from "@brains/plugins";
import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import {
  loadLinkedInProfileImport,
  type LinkedInProfessionalSnapshotSource,
} from "../lib/load-profile-import";
import { mergeProfileImport } from "../lib/merge-profile";

export type LinkedInImportJobData = Record<string, never>;

export const linkedinImportJobSchema: z.ZodType<LinkedInImportJobData> = z
  .object({})
  .strict();

export interface LinkedInImportJobResult {
  recordsRead: number;
  updated: boolean;
  appliedFields: string[];
  preservedFields: string[];
}

export interface LinkedInImportHandlerDeps {
  client: LinkedInProfessionalSnapshotSource;
  entityService: IEntityService;
}

export class LinkedInImportJobHandler extends BaseJobHandler<
  "linkedin-import",
  LinkedInImportJobData,
  LinkedInImportJobResult
> {
  private readonly deps: LinkedInImportHandlerDeps;

  constructor(logger: Logger, deps: LinkedInImportHandlerDeps) {
    super(logger, {
      schema: linkedinImportJobSchema,
      jobTypeName: "linkedin-import",
    });
    this.deps = deps;
  }

  async process(
    _data: LinkedInImportJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<LinkedInImportJobResult> {
    await this.reportProgress(progressReporter, {
      progress: 10,
      message: "Fetching LinkedIn professional snapshots",
    });

    const loaded = await loadLinkedInProfileImport(this.deps.client);

    await this.reportProgress(progressReporter, {
      progress: 55,
      message: "Merging LinkedIn profile data",
    });

    const profile = await this.deps.entityService.getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    });
    if (!profile) {
      throw new Error("Anchor profile not found");
    }

    const merged = mergeProfileImport(profile.content, loaded.patch);
    if (merged.changed) {
      const mutation = await this.deps.entityService.updateEntity({
        entity: { ...profile, content: merged.content },
        ...(profile.contentHash
          ? { options: { expectedContentHash: profile.contentHash } }
          : {}),
      });
      if (mutation.skipped) {
        throw new Error(
          "Anchor profile changed during LinkedIn import; retry the import",
        );
      }
    }

    await this.reportProgress(progressReporter, {
      progress: 100,
      message: merged.changed
        ? "LinkedIn profile import completed"
        : "LinkedIn profile already up to date",
    });

    return {
      recordsRead: loaded.recordsRead,
      updated: merged.changed,
      appliedFields: merged.appliedFields,
      preservedFields: merged.preservedFields,
    };
  }

  protected override summarizeDataForLog(): Record<string, unknown> {
    return {};
  }
}
