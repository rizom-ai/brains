import {
  createBuiltInStudioWorkspaceRegistration,
  defineStudioWorkspace,
  defineWorkspaceAction,
  type OperatorCaller,
  type ServicePluginContext,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { LinkedInApiError } from "./lib/linkedin-client";
import type { ImportOutcome } from "./lib/merge-profile";
import type { ProfileImport } from "./lib/profile-import";
import type { ProfileImport as ImportedValues } from "./lib/profile-mapper";

const FIELD_LABELS: Record<keyof ImportedValues, string> = {
  name: "Name",
  headline: "Headline",
  industry: "Industry",
  location: "Location",
  website: "Website",
  story: "Story",
};

const OUTCOME_LABELS: Record<ImportOutcome, string> = {
  fill: "Fill",
  preserve: "Keep yours",
  unchanged: "Same",
};

const CELL_LENGTH = 200;

const importProfile = defineWorkspaceAction({
  name: "import-profile",
  label: "Import from LinkedIn",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: z.object({}),
  output: z.object({ filled: z.array(z.string()), kept: z.array(z.string()) }),
});

const outcomeSchema = z.enum(["fill", "preserve", "unchanged"]);

const workspaceDataSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    fields: z.array(
      z.object({
        field: z.enum([
          "name",
          "headline",
          "industry",
          "location",
          "website",
          "story",
        ]),
        current: z.string().nullable(),
        imported: z.string(),
        outcome: outcomeSchema,
      }),
    ),
  }),
  z.object({ status: z.literal("unavailable"), message: z.string() }),
]);

function cell(value: string | null): string {
  if (value === null) return "—";
  return value.length > CELL_LENGTH
    ? `${value.slice(0, CELL_LENGTH - 1)}…`
    : value;
}

function list(names: readonly string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const linkedInWorkspace = defineStudioWorkspace({
  id: "linkedin",
  label: "LinkedIn",
  description:
    "Fill your profile from LinkedIn without touching what you wrote.",
  priority: 70,
  permission: "admin",
  data: workspaceDataSchema,
  actions: [importProfile],
  view: ({ data }) => {
    if (data.status === "unavailable") {
      return {
        title: "LinkedIn",
        blocks: [{ type: "notice", tone: "warn", text: data.message }],
      };
    }
    const fills = data.fields.some((field) => field.outcome === "fill");
    return {
      kicker: "Profile import",
      title: "LinkedIn",
      description:
        "What LinkedIn holds for each profile field, and what an import would do with it.",
      status: {
        label: fills ? "Ready to import" : "Profile already complete",
        tone: fills ? "good" : "neutral",
      },
      ...(fills ? { primaryAction: { action: importProfile, input: {} } } : {}),
      blocks: [
        {
          type: "table",
          id: "linkedin-fields",
          empty: "LinkedIn holds no profile fields for this account.",
          columns: [
            { key: "field", label: "Field" },
            { key: "current", label: "Your profile" },
            { key: "imported", label: "LinkedIn" },
            { key: "outcome", label: "Import" },
          ],
          rows: data.fields.map((field) => ({
            id: field.field,
            cells: {
              field: FIELD_LABELS[field.field],
              current: cell(field.current),
              imported: cell(field.imported),
              outcome: OUTCOME_LABELS[field.outcome],
            },
          })),
        },
      ],
    };
  },
});

function isAnchor(caller: OperatorCaller | null): boolean {
  return caller?.permission === "admin" && caller.isAnchor;
}

function requireAnchor(caller: OperatorCaller | null): void {
  if (!isAnchor(caller)) {
    throw new Error("The LinkedIn import belongs to the Anchor alone");
  }
}

function unavailableMessage(error: unknown): string {
  if (error instanceof LinkedInApiError && [401, 403].includes(error.status)) {
    return "LinkedIn refused the access token. Set a valid token for the linkedin-import plugin in brain.yaml.";
  }
  return `LinkedIn could not be read: ${getErrorMessage(error)}`;
}

/** Registers the Anchor's LinkedIn workspace when Studio is available. */
export async function registerLinkedInWorkspace(
  context: ServicePluginContext,
  profileImport: ProfileImport,
): Promise<void> {
  if (context.executionOnly || !context.studio.isAvailable()) return;
  const registration = createBuiltInStudioWorkspaceRegistration({
    context,
    definition: linkedInWorkspace,
    bind: (binding) =>
      linkedInWorkspace.bind(binding, {
        load: async ({ caller }) => {
          requireAnchor(caller);
          try {
            const preview = await profileImport.preview();
            return { status: "ready" as const, fields: preview.fields };
          } catch (error) {
            return {
              status: "unavailable" as const,
              message: unavailableMessage(error),
            };
          }
        },
        actions: [
          importProfile.bind(
            binding,
            async ({ caller }) => {
              requireAnchor(caller);
              return profileImport.apply();
            },
            async ({ caller }) => {
              requireAnchor(caller);
              const preview = await profileImport.preview();
              const filled = preview.fields
                .filter((field) => field.outcome === "fill")
                .map((field) => FIELD_LABELS[field.field].toLowerCase());
              const kept = preview.fields
                .filter((field) => field.outcome === "preserve")
                .map((field) => FIELD_LABELS[field.field].toLowerCase());
              if (filled.length === 0) {
                throw new Error(
                  "Your profile already has everything LinkedIn holds.",
                );
              }
              return {
                summary: `Fill your ${list(filled)} from LinkedIn?${kept.length > 0 ? ` Your ${list(kept)} stay as you wrote them.` : ""}`,
                revision: preview.revision,
              };
            },
          ),
        ],
      }),
  });
  await context.studio.registerWorkspace({
    ...registration,
    accessHandler: async (actor) =>
      actor.isAnchor && (await registration.accessHandler(actor)),
  });
}
