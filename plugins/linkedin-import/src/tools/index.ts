import {
  ConfirmationArgsStore,
  type IEntityService,
  type ServicePluginContext,
  type Tool,
  type ToolResponse,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  linkedinProfessionalSnapshotDomainSchema,
  type LinkedInClient,
  type LinkedInProfessionalSnapshotDomain,
} from "../lib/linkedin-client";
import { loadLinkedInProfileImport } from "../lib/load-profile-import";
import { mergeProfileImport } from "../lib/merge-profile";
import { summarizeLinkedInSnapshotSchema } from "../lib/snapshot-schema";
import type { ProfessionalProfileImportPatch } from "../lib/transform/profile-mapper";

export interface LinkedInImportToolsDeps {
  client: Pick<LinkedInClient, "fetchDomain">;
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

interface LinkedInInspectSchemaToolInput {
  domain: LinkedInProfessionalSnapshotDomain;
}

const inspectSchemaInputSchema = {
  domain: linkedinProfessionalSnapshotDomainSchema.describe(
    "Professional snapshot domain to inspect without returning member values",
  ),
};

const inspectSchemaInputParserSchema: z.ZodType<LinkedInInspectSchemaToolInput> =
  z.object(inspectSchemaInputSchema).strict();

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

        const [loaded, profile] = await Promise.all([
          loadLinkedInProfileImport(deps.client),
          deps.entityService.getEntity({
            entityType: "anchor-profile",
            id: "anchor-profile",
          }),
        ]);
        if (!profile) {
          return { success: false, error: "Anchor profile not found" };
        }

        const merge = mergeProfileImport(profile.content, loaded.patch);
        if (!merge.changed) {
          return {
            success: true,
            data: {
              status: loaded.recordsRead === 0 ? "no-data" : "up-to-date",
              recordsRead: loaded.recordsRead,
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
            loaded.patch,
            merge.appliedFields,
            merge.preservedFields,
          ),
          args: confirmationArgs,
        };
      },
    },
    {
      name: `${pluginId}_inspect_schema`,
      description:
        "Inspect a sanctioned LinkedIn professional snapshot domain and return only field names, value types, and occurrence counts. Never returns member values. Use this to verify source contracts before implementing or debugging domain mappings.",
      inputSchema: inspectSchemaInputSchema,
      visibility: "anchor",
      sideEffects: "none",
      handler: async (rawInput): Promise<ToolResponse> => {
        const parsed = inspectSchemaInputParserSchema.safeParse(rawInput);
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid input: ${parsed.error.message}`,
          };
        }

        const records = await deps.client.fetchDomain(parsed.data.domain);
        return {
          success: true,
          data: {
            domain: parsed.data.domain,
            ...summarizeLinkedInSnapshotSchema(records),
          },
        };
      },
    },
  ];
}
