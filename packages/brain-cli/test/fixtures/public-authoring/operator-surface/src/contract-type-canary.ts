import {
  defineAccountSettings,
  defineDashboardWidget,
  defineStudioWorkspace,
  defineWorkspaceAction,
  z,
  type AccountSettingsDefinition,
  type AccountSettingsFieldDefinition,
  type AccountSettingsValue,
  type DashboardDigest,
  type DashboardOperatorView,
  type DashboardWidgetDefinition,
  type OperatorCaller,
  type OperatorQueryReader,
  type OperatorView,
  type StudioWorkspaceDefinition,
  type StudioWorkspaceView,
  type StudioWorkspaceViewBlock,
  type WorkspaceActionConfirmation,
  type WorkspaceActionDefinition,
  type WorkspaceActionFormControl,
  type WorkspaceActionFormDefinition,
  type WorkspaceActionFormFieldDefinition,
  type WorkspaceActionFormFieldMap,
  type WorkspaceActionFormOption,
  type WorkspaceActionResultDefinition,
  type WorkspaceActionResultFieldDefinition,
  type WorkspaceActionResultFieldMap,
  type WorkspacePreparedConfirmation,
} from "@rizom/brain/services";

// Included by the standalone and packed typechecks, not loaded by a brain.

// Account settings, each field described through its own type.
const tokenField: AccountSettingsFieldDefinition = {
  label: "Access token",
  secret: true,
};
const archiveSettings = defineAccountSettings({
  title: "Archive",
  schema: z.object({ token: z.string().min(1) }),
  fields: { token: tokenField },
});
export const archiveSettingsDefinition: AccountSettingsDefinition =
  archiveSettings;
const storedSettings: AccountSettingsValue<typeof archiveSettings> = {
  token: "stored",
};
void storedSettings;

// An action, its form and its result, each written through its own type.
const archiveInput = z.object({
  reason: z.enum(["read", "stale"]),
  note: z.string(),
});
const archiveOutput = z.object({ archived: z.boolean() });
const confirmation: WorkspaceActionConfirmation = { kind: "prepared" };
const archiveReading = defineWorkspaceAction({
  name: "archive-reading",
  label: "Archive reading",
  permission: "trusted",
  confirmation,
  input: archiveInput,
  output: archiveOutput,
});
export const archiveActionDefinition: WorkspaceActionDefinition<
  "archive-reading",
  typeof archiveInput,
  typeof archiveOutput
> = archiveReading;

const reasons: readonly WorkspaceActionFormOption[] = [
  { value: "read", label: "Read" },
  { value: "stale", label: "No longer relevant" },
];
const noteControl: WorkspaceActionFormControl = "textarea";
const reasonField: WorkspaceActionFormFieldDefinition = {
  label: "Why",
  control: "select",
  options: reasons,
};
const formFields: WorkspaceActionFormFieldMap<typeof archiveInput> = {
  reason: reasonField,
  note: { label: "Note", control: noteControl },
};
const form: WorkspaceActionFormDefinition<typeof archiveInput> = {
  submitLabel: "Archive",
  fields: formFields,
};
const archivedField: WorkspaceActionResultFieldDefinition = {
  label: "Archived",
};
const resultFields: WorkspaceActionResultFieldMap<typeof archiveOutput> = {
  archived: archivedField,
};
const result: WorkspaceActionResultDefinition<typeof archiveOutput> = {
  title: "Reading archived",
  fields: resultFields,
};

/** What an operator is asked to confirm, at the revision it was prepared from. */
export function prepareArchive(
  caller: OperatorCaller,
): WorkspacePreparedConfirmation {
  return {
    summary: `${caller.actor.displayName ?? caller.actor.id} archives a reading`,
    revision: caller.permission,
  };
}

const archiveQuery = z.object({ shelf: z.string().optional() });

/** A view written outside the workspace that is handed what it reads. */
function archiveView(
  query: OperatorQueryReader,
): StudioWorkspaceView<typeof archiveReading> {
  const shelf = query.get(archiveQuery).shelf ?? "all";
  const blocks: StudioWorkspaceViewBlock<typeof archiveReading>[] = [
    { type: "text", id: "shelf", label: "Shelf", text: shelf },
    {
      type: "action",
      action: archiveReading,
      input: { reason: "read", note: "" },
      form,
      result,
    },
  ];
  const view: OperatorView<typeof archiveReading> = {
    title: "Archive",
    blocks,
  };
  return view;
}

export const archiveWorkspace: StudioWorkspaceDefinition =
  defineStudioWorkspace({
    id: "archive",
    label: "Archive",
    permission: "trusted",
    query: archiveQuery,
    data: z.object({ shelf: z.string() }),
    actions: [archiveReading],
    view: ({ data }) => ({
      title: data.shelf,
      blocks: [{ type: "text", id: "shelf", label: "Shelf", text: data.shelf }],
    }),
  });
export const renderArchive = archiveView;

// A Dashboard widget's digest and view, each written through its own type.
const archiveWidgetData = z.object({ archived: z.number().int() });
export const archiveWidget: DashboardWidgetDefinition<
  "archive",
  typeof archiveWidgetData
> = defineDashboardWidget({
  id: "archive",
  title: "Archive",
  group: "knowledge",
  placement: "sidebar",
  permission: "trusted",
  data: archiveWidgetData,
  digest: ({ data }) => {
    const digest: DashboardDigest = {
      items: [{ label: "Archived", value: String(data.archived) }],
    };
    return digest;
  },
  view: ({ data }) => {
    const view: DashboardOperatorView = {
      blocks: [
        { type: "stats", items: [{ label: "Archived", value: data.archived }] },
      ],
    };
    return view;
  },
});
