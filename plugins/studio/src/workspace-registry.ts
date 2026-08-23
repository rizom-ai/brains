import type {
  StudioWorkspaceDescriptor,
  StudioWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

const workspaceRegistrationSchema = z.object({
  id: z.string().trim().min(1),
  pluginId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  rendererName: z.literal("DeclarativeOperatorWorkspace"),
  priority: z.number().int(),
  urlQuery: z.literal(true).optional(),
  entityTypes: z
    .union([
      z.array(z.string().trim().min(1)),
      z.custom<
        Extract<
          StudioWorkspaceRegistration["entityTypes"],
          (actor: never) => unknown
        >
      >((value) => typeof value === "function", {
        message: "Expected Studio workspace entity types resolver function",
      }),
    ])
    .default([]),
  accessHandler: z.custom<StudioWorkspaceRegistration["accessHandler"]>(
    (value) => typeof value === "function",
    { message: "Expected Studio workspace access handler function" },
  ),
  dataProvider: z.custom<StudioWorkspaceRegistration["dataProvider"]>(
    (value) => typeof value === "function",
    { message: "Expected Studio workspace data provider function" },
  ),
  actionHandler: z
    .custom<NonNullable<StudioWorkspaceRegistration["actionHandler"]>>(
      (value) => typeof value === "function",
      { message: "Expected Studio workspace action handler function" },
    )
    .optional(),
  badgeProvider: z
    .custom<NonNullable<StudioWorkspaceRegistration["badgeProvider"]>>(
      (value) => typeof value === "function",
      { message: "Expected Studio workspace badge provider function" },
    )
    .optional(),
});

export interface StoredStudioWorkspace extends Omit<
  StudioWorkspaceDescriptor,
  "entityTypes"
> {
  entityTypes: NonNullable<StudioWorkspaceRegistration["entityTypes"]>;
  accessHandler: StudioWorkspaceRegistration["accessHandler"];
  dataProvider: StudioWorkspaceRegistration["dataProvider"];
  actionHandler?: StudioWorkspaceRegistration["actionHandler"];
  badgeProvider?: StudioWorkspaceRegistration["badgeProvider"];
}

export class StudioWorkspaceRegistry {
  private readonly workspaces = new Map<string, StoredStudioWorkspace>();

  register(input: StudioWorkspaceRegistration): StoredStudioWorkspace {
    const parsed = workspaceRegistrationSchema.parse(input);
    if (this.workspaces.has(parsed.id)) {
      throw new Error(`Studio workspace already registered: ${parsed.id}`);
    }
    const workspace: StoredStudioWorkspace = {
      id: parsed.id,
      pluginId: parsed.pluginId,
      label: parsed.label,
      rendererName: parsed.rendererName,
      priority: parsed.priority,
      ...(parsed.urlQuery ? { urlQuery: true } : {}),
      entityTypes: parsed.entityTypes,
      accessHandler: parsed.accessHandler,
      dataProvider: parsed.dataProvider,
      ...(parsed.actionHandler ? { actionHandler: parsed.actionHandler } : {}),
      ...(parsed.badgeProvider ? { badgeProvider: parsed.badgeProvider } : {}),
    };
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  get(id: string): StoredStudioWorkspace | undefined {
    return this.workspaces.get(id);
  }

  unregister(pluginId: string, workspaceId?: string): number {
    let removed = 0;
    for (const [id, workspace] of this.workspaces) {
      if (
        workspace.pluginId === pluginId &&
        (workspaceId === undefined || workspace.id === workspaceId)
      ) {
        this.workspaces.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async listDescriptors(
    actor: Parameters<StudioWorkspaceRegistration["accessHandler"]>[0],
  ): Promise<StudioWorkspaceDescriptor[]> {
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
            ...(workspace.urlQuery ? { urlQuery: true as const } : {}),
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
  workspace: StoredStudioWorkspace,
  actor: Parameters<StudioWorkspaceRegistration["accessHandler"]>[0],
): Promise<number | undefined> {
  if (!workspace.badgeProvider) return undefined;
  try {
    const badge = await workspace.badgeProvider(actor);
    return typeof badge === "number" && Number.isInteger(badge) && badge >= 0
      ? badge
      : undefined;
  } catch {
    return undefined;
  }
}
