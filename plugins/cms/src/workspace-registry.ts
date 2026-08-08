import type {
  CmsWorkspaceDescriptor,
  CmsWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

const workspaceRegistrationSchema = z.object({
  id: z.string().trim().min(1),
  pluginId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  rendererName: z.enum([
    "PublishingWorkspace",
    "SiteWorkspace",
    "DirectorySyncWorkspace",
    "EmailTriageWorkspace",
    "UnifiedInboxWorkspace",
  ]),
  priority: z.number().int(),
  entityTypes: z
    .union([
      z.array(z.string().trim().min(1)),
      z.custom<
        Extract<
          CmsWorkspaceRegistration["entityTypes"],
          (actor: never) => unknown
        >
      >((value) => typeof value === "function", {
        message: "Expected CMS workspace entity types resolver function",
      }),
    ])
    .default([]),
  accessHandler: z.custom<CmsWorkspaceRegistration["accessHandler"]>(
    (value) => typeof value === "function",
    { message: "Expected CMS workspace access handler function" },
  ),
  dataProvider: z.custom<CmsWorkspaceRegistration["dataProvider"]>(
    (value) => typeof value === "function",
    { message: "Expected CMS workspace data provider function" },
  ),
  actionHandler: z
    .custom<NonNullable<CmsWorkspaceRegistration["actionHandler"]>>(
      (value) => typeof value === "function",
      { message: "Expected CMS workspace action handler function" },
    )
    .optional(),
  badgeProvider: z
    .custom<NonNullable<CmsWorkspaceRegistration["badgeProvider"]>>(
      (value) => typeof value === "function",
      { message: "Expected CMS workspace badge provider function" },
    )
    .optional(),
});

export interface StoredCmsWorkspace extends Omit<
  CmsWorkspaceDescriptor,
  "entityTypes"
> {
  entityTypes: NonNullable<CmsWorkspaceRegistration["entityTypes"]>;
  accessHandler: CmsWorkspaceRegistration["accessHandler"];
  dataProvider: CmsWorkspaceRegistration["dataProvider"];
  actionHandler?: CmsWorkspaceRegistration["actionHandler"];
  badgeProvider?: CmsWorkspaceRegistration["badgeProvider"];
}

export class CmsWorkspaceRegistry {
  private readonly workspaces = new Map<string, StoredCmsWorkspace>();

  register(input: CmsWorkspaceRegistration): StoredCmsWorkspace {
    const parsed = workspaceRegistrationSchema.parse(input);
    if (this.workspaces.has(parsed.id)) {
      throw new Error(`CMS workspace already registered: ${parsed.id}`);
    }
    const workspace: StoredCmsWorkspace = {
      id: parsed.id,
      pluginId: parsed.pluginId,
      label: parsed.label,
      rendererName: parsed.rendererName,
      priority: parsed.priority,
      entityTypes: parsed.entityTypes,
      accessHandler: parsed.accessHandler,
      dataProvider: parsed.dataProvider,
      ...(parsed.actionHandler ? { actionHandler: parsed.actionHandler } : {}),
      ...(parsed.badgeProvider ? { badgeProvider: parsed.badgeProvider } : {}),
    };
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  get(id: string): StoredCmsWorkspace | undefined {
    return this.workspaces.get(id);
  }

  async listDescriptors(
    actor: Parameters<CmsWorkspaceRegistration["accessHandler"]>[0],
  ): Promise<CmsWorkspaceDescriptor[]> {
    const sorted = Array.from(this.workspaces.values()).sort(
      (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
    );
    const admitted = await Promise.all(
      sorted.map(async (workspace) => ({
        workspace,
        admitted: await workspace.accessHandler(actor),
      })),
    );
    return Promise.all(
      admitted
        .filter(({ admitted: isAdmitted }) => isAdmitted)
        .map(async ({ workspace }) => {
          const badge = await resolveBadge(workspace, actor);
          return {
            id: workspace.id,
            pluginId: workspace.pluginId,
            label: workspace.label,
            rendererName: workspace.rendererName,
            priority: workspace.priority,
            entityTypes:
              typeof workspace.entityTypes === "function"
                ? await workspace.entityTypes(actor)
                : workspace.entityTypes,
            ...(badge !== undefined ? { badge } : {}),
          };
        }),
    );
  }
}

async function resolveBadge(
  workspace: StoredCmsWorkspace,
  actor: Parameters<CmsWorkspaceRegistration["accessHandler"]>[0],
): Promise<number | undefined> {
  if (!workspace.badgeProvider) return undefined;
  try {
    const badge = await workspace.badgeProvider(actor);
    return Number.isInteger(badge) && (badge ?? -1) >= 0 ? badge : undefined;
  } catch {
    return undefined;
  }
}
