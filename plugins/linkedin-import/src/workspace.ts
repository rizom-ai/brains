import {
  defineStudioWorkspace,
  defineWorkspaceAction,
  type OperatorCaller,
} from "@brains/sdk/services";
import type { ServiceStudio } from "@brains/sdk/internal/service-runtime";
import { SdkError } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { LinkedInApiError, type LinkedInClient } from "./lib/linkedin-client";
import {
  isExpired,
  type LinkedInConnections,
  type StoredConnection,
} from "./lib/linkedin-connection";
import type {
  ProfileImportFieldName,
  ProfileImportOutcome,
} from "@brains/contracts";
import type { ProfileImport } from "./lib/profile-import";
import { inspectRichDomains } from "./lib/snapshot-shape";

const FIELD_LABELS: Record<ProfileImportFieldName, string> = {
  name: "Name",
  headline: "Headline",
  industry: "Industry",
  location: "Location",
  website: "Website",
  story: "Story",
};

const OUTCOME_LABELS: Record<ProfileImportOutcome, string> = {
  fill: "Fill",
  preserve: "Keep yours",
  unchanged: "Same",
};

const CONNECTION_NOTICES = {
  connected: { tone: "good", text: "LinkedIn is connected." },
  declined: {
    tone: "neutral",
    text: "LinkedIn connection was declined. Connect again when you are ready.",
  },
  failed: {
    tone: "warn",
    text: "LinkedIn could not be connected. Start the connection again.",
  },
} as const;

const CELL_LENGTH = 200;

const importProfile = defineWorkspaceAction({
  name: "import-profile",
  label: "Import from LinkedIn",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: z.object({}),
  output: z.object({ filled: z.array(z.string()), kept: z.array(z.string()) }),
});

const disconnect = defineWorkspaceAction({
  name: "disconnect",
  label: "Disconnect LinkedIn",
  permission: "admin",
  confirmation: {
    kind: "static",
    message:
      "Forget the LinkedIn token? Imported profile values stay; importing again needs a new connection.",
  },
  input: z.object({}),
  output: z.object({ disconnected: z.boolean() }),
});

const inspectShapes = defineWorkspaceAction({
  name: "inspect-shapes",
  label: "Inspect LinkedIn data shapes",
  permission: "admin",
  input: z.object({}),
  output: z.object({ shapes: z.string() }),
});

const querySchema = z.object({
  connection: z.enum(["connected", "declined", "failed"]).optional(),
});

const fieldSchema = z.object({
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
  outcome: z.enum(["fill", "preserve", "unchanged"]),
});

const connectionSchema = querySchema.shape.connection;

const workspaceDataSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("disconnected"),
    expired: z.boolean(),
    startUrl: z.string(),
    connection: connectionSchema,
  }),
  z.object({
    status: z.literal("unavailable"),
    message: z.string(),
    startUrl: z.string(),
    connection: connectionSchema,
  }),
  z.object({
    status: z.literal("ready"),
    fields: z.array(fieldSchema),
    connection: connectionSchema,
  }),
]);
type WorkspaceData = z.output<typeof workspaceDataSchema>;

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

function connectLink(
  startUrl: string,
  label: string,
): {
  type: "links";
  items: { label: string; target: { external: string } }[];
} {
  return { type: "links", items: [{ label, target: { external: startUrl } }] };
}

function connectionNotice(data: WorkspaceData): {
  type: "notice";
  tone: "good" | "neutral" | "warn";
  text: string;
}[] {
  const notice = data.connection ? CONNECTION_NOTICES[data.connection] : null;
  return notice ? [{ type: "notice", ...notice }] : [];
}

const linkedInWorkspace = defineStudioWorkspace({
  id: "linkedin",
  label: "LinkedIn",
  description:
    "Fill your profile from LinkedIn without touching what you wrote.",
  priority: 70,
  permission: "admin",
  query: querySchema,
  data: workspaceDataSchema,
  actions: [importProfile, disconnect, inspectShapes],
  view: ({ data }) => {
    if (data.status === "disconnected") {
      return {
        kicker: "Profile import",
        title: "LinkedIn",
        description:
          "Connect your LinkedIn account to fill your profile from it. Only members in the European Economic Area can connect.",
        status: { label: "Not connected", tone: "neutral" },
        blocks: [
          ...connectionNotice(data),
          ...(data.expired
            ? [
                {
                  type: "notice" as const,
                  tone: "warn" as const,
                  text: "Your LinkedIn connection expired. Connect again to import.",
                },
              ]
            : []),
          connectLink(data.startUrl, "Connect LinkedIn"),
        ],
      };
    }
    if (data.status === "unavailable") {
      return {
        kicker: "Profile import",
        title: "LinkedIn",
        status: { label: "Connection needs attention", tone: "warn" },
        blocks: [
          ...connectionNotice(data),
          { type: "notice", tone: "warn", text: data.message },
          connectLink(data.startUrl, "Connect LinkedIn again"),
          { type: "action", action: disconnect, input: {} },
        ],
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
        ...connectionNotice(data),
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
        {
          type: "card",
          id: "linkedin-shapes",
          label: "Data shapes",
          blocks: [
            {
              type: "text",
              text: "Field names, value types and record forms of your skills, positions, education and certifications on LinkedIn, with every value replaced, for writing import fixtures.",
            },
            {
              type: "action",
              action: inspectShapes,
              input: {},
              result: {
                title: "LinkedIn data shapes",
                fields: { shapes: { label: "Shapes (JSON)", copyable: true } },
              },
            },
          ],
        },
        { type: "action", action: disconnect, input: {} },
      ],
    };
  },
});

function anchorId(caller: OperatorCaller | null): string {
  if (caller?.permission !== "admin" || !caller.isAnchor) {
    throw new SdkError("permission_denied", {
      publicMessage: "The LinkedIn import belongs to the Anchor alone",
    });
  }
  return caller.actor.id;
}

function unavailableMessage(error: unknown): string {
  if (error instanceof LinkedInApiError && [401, 403].includes(error.status)) {
    return "LinkedIn refused the connection. It may have been revoked; connect again.";
  }
  return `LinkedIn could not be read: ${getErrorMessage(error)}`;
}

export interface LinkedInWorkspaceDeps {
  profileImport: ProfileImport;
  /** A snapshot client reading with the given token. */
  clientFor(accessToken: string): LinkedInClient;
  connections: LinkedInConnections;
  /** Absolute URL of the OAuth start route, for Studio's external link. */
  startUrl: string;
}

/**
 * Registers the Anchor's LinkedIn workspace when Studio is available and
 * returns its URL, where the OAuth callback sends the owner back.
 */
export async function registerLinkedInWorkspace(
  studio: ServiceStudio,
  deps: LinkedInWorkspaceDeps,
): Promise<string | undefined> {
  if (!studio.isAvailable()) return undefined;
  const connected = async (
    caller: OperatorCaller | null,
  ): Promise<StoredConnection> => {
    const connection = await deps.connections.get(anchorId(caller));
    if (!connection || isExpired(connection)) {
      throw new SdkError("conflict", {
        publicMessage: "Connect LinkedIn before importing.",
      });
    }
    return connection;
  };
  const registration = studio.source({
    definition: linkedInWorkspace,
    bind: (binding) =>
      linkedInWorkspace.bind(binding, {
        load: async ({ caller, query }): Promise<WorkspaceData> => {
          const userId = anchorId(caller);
          const { connection: outcome } = query.get(querySchema);
          const connection = await deps.connections.get(userId);
          if (!connection || isExpired(connection)) {
            return {
              status: "disconnected",
              expired: connection !== null,
              startUrl: deps.startUrl,
              connection: outcome,
            };
          }
          try {
            const preview = await deps.profileImport.preview(
              connection.accessToken,
            );
            return {
              status: "ready",
              fields: preview.fields,
              connection: outcome,
            };
          } catch (error) {
            return {
              status: "unavailable",
              message: unavailableMessage(error),
              startUrl: deps.startUrl,
              connection: outcome,
            };
          }
        },
        actions: [
          importProfile.bind(
            binding,
            async ({ caller }) =>
              deps.profileImport.apply((await connected(caller)).accessToken),
            async ({ caller }) => {
              const preview = await deps.profileImport.preview(
                (await connected(caller)).accessToken,
              );
              const labelled = (outcome: ProfileImportOutcome): string[] =>
                preview.fields
                  .filter((field) => field.outcome === outcome)
                  .map((field) => FIELD_LABELS[field.field].toLowerCase());
              const filled = labelled("fill");
              const kept = labelled("preserve");
              if (filled.length === 0) {
                throw new SdkError("conflict", {
                  publicMessage:
                    "Your profile already has everything LinkedIn holds.",
                });
              }
              return {
                summary: `Fill your ${list(filled)} from LinkedIn?${kept.length > 0 ? ` Your ${list(kept)} stay as you wrote them.` : ""}`,
                revision: preview.revision,
              };
            },
          ),
          inspectShapes.bind(binding, async ({ caller }) => {
            const shapes = await inspectRichDomains(
              deps.clientFor((await connected(caller)).accessToken),
            );
            return { shapes: JSON.stringify(shapes, null, 2) };
          }),
          disconnect.bind(binding, async ({ caller }) => {
            await deps.connections.forget(anchorId(caller));
            return { disconnected: true };
          }),
        ],
      }),
  });
  return studio.register({
    ...registration,
    accessHandler: async (actor) =>
      actor.isAnchor && (await registration.accessHandler(actor)),
  });
}
