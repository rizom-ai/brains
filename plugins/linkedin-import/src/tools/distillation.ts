import {
  ConfirmationArgsStore,
  type IEntityService,
  type ServicePluginContext,
  type Tool,
  type ToolResponse,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  applyProfileNarrativeProposal,
  buildProfileDistillationPrompt,
  profileNarrativeProposalSchema,
  type ProfileNarrativeProposal,
} from "../lib/profile-distillation";
import { profileContentDigest } from "../lib/profile-import-digest";

export interface LinkedInDistillationToolsDeps {
  ai: Pick<ServicePluginContext["ai"], "generateObject">;
  entityService: IEntityService;
  jobs: ServicePluginContext["jobs"];
}

interface LinkedInDistillationToolInput {
  confirmed?: boolean | undefined;
  confirmationToken?: string | undefined;
  expectedProfileDigest?: string | undefined;
  proposal?: ProfileNarrativeProposal | undefined;
}

const distillationInputSchema = {
  confirmed: z.boolean().optional().describe("Confirm the reviewed proposal"),
  confirmationToken: z
    .string()
    .optional()
    .describe("Internal token returned by the confirmation flow"),
  expectedProfileDigest: z
    .string()
    .length(64)
    .optional()
    .describe("Internal digest binding review to the current profile"),
  proposal: profileNarrativeProposalSchema
    .optional()
    .describe("Internal reviewed narrative proposal"),
};

const distillationInputParserSchema: z.ZodType<LinkedInDistillationToolInput> =
  z.object(distillationInputSchema).strict();

function proposalPreview(
  proposal: ProfileNarrativeProposal,
  changedFields: string[],
): string {
  return [
    `Narrative fields to replace: ${changedFields.join(", ")}`,
    JSON.stringify(proposal, null, 2),
    "This optional semantic pass changes only tagline, intro, and story. Structured professional fields, including headline, remain unchanged.",
  ].join("\n\n");
}

export function createLinkedInDistillationTools(
  pluginId: string,
  deps: LinkedInDistillationToolsDeps,
): Tool[] {
  const confirmationArgsStore = new ConfirmationArgsStore();
  const toolName = `${pluginId}_distill_profile`;

  return [
    {
      name: toolName,
      description:
        "Optionally generate a reviewed tagline, introduction, and story from the current structured professional profile. This is separate from deterministic LinkedIn import, never rewrites headline, and requires typed confirmation before writing.",
      inputSchema: distillationInputSchema,
      visibility: "anchor",
      sideEffects: "writes",
      handler: async (rawInput): Promise<ToolResponse> => {
        const parsed = distillationInputParserSchema.safeParse(rawInput);
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid input: ${parsed.error.message}`,
          };
        }
        const input = parsed.data;

        if (input.confirmed) {
          const validation = confirmationArgsStore.validate(
            input.confirmationToken,
            input,
          );
          if (validation.status !== "ok") {
            return {
              success: false,
              error:
                "No matching profile narrative confirmation found. Generate and review a new proposal.",
            };
          }
          if (!input.proposal || !input.expectedProfileDigest) {
            return {
              success: false,
              error: "Profile narrative confirmation is incomplete.",
            };
          }

          const jobId = await deps.jobs.enqueue({
            type: "linkedin-profile-distill",
            data: {
              proposal: input.proposal,
              expectedProfileDigest: input.expectedProfileDigest,
            },
          });
          return {
            success: true,
            data: { jobId, status: "queued" },
          };
        }

        const profile = await deps.entityService.getEntity({
          entityType: "anchor-profile",
          id: "anchor-profile",
        });
        if (!profile)
          return { success: false, error: "Anchor profile not found" };

        const { object: proposal } = await deps.ai.generateObject(
          buildProfileDistillationPrompt(profile.content),
          profileNarrativeProposalSchema,
        );
        const applied = applyProfileNarrativeProposal(
          profile.content,
          proposal,
        );
        if (!applied.changed) {
          return {
            success: true,
            data: { status: "up-to-date", changedFields: [] },
          };
        }

        const confirmationArgs =
          confirmationArgsStore.create<LinkedInDistillationToolInput>(
            (confirmationToken) => ({
              confirmed: true,
              confirmationToken,
              expectedProfileDigest: profileContentDigest(profile.content),
              proposal,
            }),
          );

        return {
          needsConfirmation: true,
          toolName,
          summary: "Apply the reviewed profile narrative proposal?",
          completionSummary: "Profile narrative update queued.",
          preview: proposalPreview(proposal, applied.changedFields),
          args: confirmationArgs,
        };
      },
    },
  ];
}
