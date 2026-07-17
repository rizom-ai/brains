import {
  ConfirmationArgsStore,
  type IEntityService,
  type ServicePluginContext,
  type Tool,
  type ToolResponse,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { LinkedInClient } from "../lib/linkedin-client";
import { mergeProfileImport } from "../lib/merge-profile";
import { mapLinkedInSnapshotDomain } from "../lib/transform/registry";
import type { ProfessionalProfileImportPatch } from "../lib/transform/profile-mapper";

export interface LinkedInImportToolsDeps {
  client: Pick<LinkedInClient, "fetchProfile">;
  entityService: IEntityService;
  jobs: ServicePluginContext["jobs"];
}

interface LinkedInImportToolInput {
  confirmed?: boolean | undefined;
  confirmationToken?: string | undefined;
}

const importInputSchema = {
  confirmed: z.boolean().optional().describe("Confirm the previewed import"),
  confirmationToken: z
    .string()
    .optional()
    .describe("Internal token returned by the confirmation flow"),
};

const importInputParserSchema: z.ZodType<LinkedInImportToolInput> = z
  .object(importInputSchema)
  .strict();

function previewValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > 300) {
    return `${value.slice(0, 300)}…`;
  }
  return value;
}

function buildPreview(
  patch: ProfessionalProfileImportPatch,
  appliedFields: string[],
  preservedFields: string[],
): string {
  const patchRecord = patch as Record<string, unknown>;
  const proposed = Object.fromEntries(
    appliedFields.map((field) => [field, previewValue(patchRecord[field])]),
  );
  const sections = [
    `Fields to add: ${appliedFields.join(", ") || "none"}`,
    JSON.stringify(proposed, null, 2),
  ];
  if (preservedFields.length > 0) {
    sections.push(
      `Existing owner-authored fields preserved: ${preservedFields.join(", ")}`,
    );
  }
  sections.push(
    "The import will refetch LinkedIn before writing and will not overwrite owner-authored values.",
  );
  return sections.join("\n\n");
}

export function createLinkedInImportTools(
  pluginId: string,
  deps: LinkedInImportToolsDeps,
): Tool[] {
  const confirmationArgsStore = new ConfirmationArgsStore();
  const toolName = `${pluginId}_import`;

  return [
    {
      name: toolName,
      description:
        "Preview and import the consenting owner's LinkedIn PROFILE snapshot into anchor-profile. Existing owner-authored values are preserved. The tool requests confirmation after showing the proposed merge; call it without confirmed first.",
      inputSchema: importInputSchema,
      visibility: "anchor",
      sideEffects: "writes",
      handler: async (rawInput): Promise<ToolResponse> => {
        const parsed = importInputParserSchema.safeParse(rawInput);
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
                "No matching LinkedIn import confirmation found. Preview the import again and approve the new confirmation.",
            };
          }

          const jobId = await deps.jobs.enqueue({
            type: "linkedin-import",
            data: {},
          });
          return {
            success: true,
            data: {
              jobId,
              status: "queued",
            },
          };
        }

        const [records, profile] = await Promise.all([
          deps.client.fetchProfile(),
          deps.entityService.getEntity({
            entityType: "anchor-profile",
            id: "anchor-profile",
          }),
        ]);
        if (!profile) {
          return { success: false, error: "Anchor profile not found" };
        }

        const patch = mapLinkedInSnapshotDomain("PROFILE", records);
        const merge = mergeProfileImport(profile.content, patch);
        if (!merge.changed) {
          return {
            success: true,
            data: {
              status: records.length === 0 ? "no-data" : "up-to-date",
              recordsRead: records.length,
              preservedFields: merge.preservedFields,
            },
          };
        }

        const confirmationArgs =
          confirmationArgsStore.create<LinkedInImportToolInput>(
            (confirmationToken) => ({
              confirmed: true,
              confirmationToken,
            }),
          );

        return {
          needsConfirmation: true,
          toolName,
          summary: "Import the previewed LinkedIn profile fields?",
          completionSummary: "LinkedIn profile import queued.",
          preview: buildPreview(
            patch,
            merge.appliedFields,
            merge.preservedFields,
          ),
          args: confirmationArgs,
        };
      },
    },
  ];
}
