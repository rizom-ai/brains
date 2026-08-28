import type {
  StudioWorkspaceActor,
  StudioWorkspaceDescriptor,
  StudioWorkspaceRegistration,
  UserPermissionLevel,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

const workspaceRegistrationSchema = z.object({
  id: z.string().trim().min(1),
  pluginId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  rendererName: z.literal("DeclarativeOperatorWorkspace"),
  priority: z.number().int(),
  permission: z.enum(["public", "trusted", "admin"]).default("trusted"),
  urlQuery: z.literal(true).optional(),
  aliases: z
    .array(
      z
        .object({
          id: z.string().trim().min(1),
          query: z.record(z.string().trim().min(1), z.string()),
        })
        .strict(),
    )
    .max(20)
    .optional(),
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
  permission: UserPermissionLevel;
  entityTypes: NonNullable<StudioWorkspaceRegistration["entityTypes"]>;
  accessHandler: StudioWorkspaceRegistration["accessHandler"];
  dataProvider: StudioWorkspaceRegistration["dataProvider"];
  actionHandler?: StudioWorkspaceRegistration["actionHandler"];
  badgeProvider?: StudioWorkspaceRegistration["badgeProvider"];
}

const permissionRank: Record<UserPermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

function meetsFloor(
  actor: StudioWorkspaceActor,
  floor: UserPermissionLevel,
): boolean {
  return permissionRank[actor.userPermissionLevel] >= permissionRank[floor];
}

function assertFloor(
  id: string,
  actor: StudioWorkspaceActor,
  floor: UserPermissionLevel,
): void {
  if (!meetsFloor(actor, floor)) {
    throw new Error(`Studio workspace "${id}" requires ${floor} permission`);
  }
}

export class StudioWorkspaceRegistry {
  private readonly workspaces = new Map<string, StoredStudioWorkspace>();

  register(input: StudioWorkspaceRegistration): StoredStudioWorkspace {
    const parsed = workspaceRegistrationSchema.parse(input);
    if (this.workspaces.has(parsed.id)) {
      throw new Error(`Studio workspace already registered: ${parsed.id}`);
    }
    const occupiedIds = new Set(
      Array.from(this.workspaces.values()).flatMap((workspace) => [
        workspace.id,
        ...(workspace.aliases?.map((alias) => alias.id) ?? []),
      ]),
    );
    const requestedIds = [
      parsed.id,
      ...(parsed.aliases?.map((alias) => alias.id) ?? []),
    ];
    const duplicateRequested = requestedIds.find(
      (id, index) => requestedIds.indexOf(id) !== index,
    );
    if (duplicateRequested || requestedIds.some((id) => occupiedIds.has(id))) {
      throw new Error(
        `Studio workspace id or alias already registered: ${duplicateRequested ?? requestedIds.find((id) => occupiedIds.has(id)) ?? parsed.id}`,
      );
    }
    const sourceEntityTypes = parsed.entityTypes;
    const entityTypes =
      typeof sourceEntityTypes === "function"
        ? async (actor: StudioWorkspaceActor): Promise<string[]> => {
            if (!meetsFloor(actor, parsed.permission)) return [];
            return sourceEntityTypes(actor);
          }
        : sourceEntityTypes;
    const sourceActionHandler = parsed.actionHandler;
    const sourceBadgeProvider = parsed.badgeProvider;
    const workspace: StoredStudioWorkspace = {
      id: parsed.id,
      pluginId: parsed.pluginId,
      label: parsed.label,
      rendererName: parsed.rendererName,
      priority: parsed.priority,
      permission: parsed.permission,
      ...(parsed.urlQuery ? { urlQuery: true } : {}),
      ...(parsed.aliases ? { aliases: parsed.aliases } : {}),
      entityTypes,
      accessHandler: async (actor): Promise<boolean> =>
        meetsFloor(actor, parsed.permission)
          ? parsed.accessHandler(actor)
          : false,
      dataProvider: async (actor, query, signal): Promise<unknown> => {
        assertFloor(parsed.id, actor, parsed.permission);
        return parsed.dataProvider(actor, query, signal);
      },
      ...(sourceActionHandler
        ? {
            actionHandler: async (request, actor, signal): Promise<unknown> => {
              assertFloor(parsed.id, actor, parsed.permission);
              return sourceActionHandler(request, actor, signal);
            },
          }
        : {}),
      ...(sourceBadgeProvider
        ? {
            badgeProvider: async (actor): Promise<number | undefined> => {
              if (!meetsFloor(actor, parsed.permission)) return undefined;
              return sourceBadgeProvider(actor);
            },
          }
        : {}),
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
          const descriptor: StudioWorkspaceDescriptor = {
            id: workspace.id,
            pluginId: workspace.pluginId,
            label: workspace.label,
            rendererName: workspace.rendererName,
            priority: workspace.priority,
            ...(workspace.urlQuery ? { urlQuery: true } : {}),
            ...(workspace.aliases ? { aliases: workspace.aliases } : {}),
            entityTypes:
              typeof workspace.entityTypes === "function"
                ? await workspace.entityTypes(actor)
                : workspace.entityTypes,
            ...(badge !== undefined ? { badge } : {}),
          };
          return descriptor;
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
