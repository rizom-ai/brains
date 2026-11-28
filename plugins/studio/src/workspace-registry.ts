import { SdkError } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  studioAttentionItemSchema,
  studioWorkspaceRegistrationSchema,
  type StudioAttentionItem,
  type StudioWorkspaceActor,
  type StudioWorkspaceDescriptor,
  type StudioWorkspaceRegistration,
} from "@brains/sdk/internal/service-runtime";
import type { UserPermissionLevel } from "@brains/sdk/interfaces";

export interface StoredStudioWorkspace extends Omit<
  StudioWorkspaceDescriptor,
  "entityTypes" | "section"
> {
  /** The section the registration named; descriptors default it to Brain. */
  section?: StudioWorkspaceDescriptor["section"];
  permission: UserPermissionLevel;
  entityTypes: NonNullable<StudioWorkspaceRegistration["entityTypes"]>;
  accessHandler: StudioWorkspaceRegistration["accessHandler"];
  dataProvider: StudioWorkspaceRegistration["dataProvider"];
  actionHandler?: StudioWorkspaceRegistration["actionHandler"];
  badgeProvider?: StudioWorkspaceRegistration["badgeProvider"];
  attentionProvider?: StudioWorkspaceRegistration["attentionProvider"];
  paletteActions?: StudioWorkspaceRegistration["paletteActions"];
}

/** An action a caller may run from ⌘K, with the page that offers it. */
export interface StudioPaletteWorkspaceAction {
  workspaceId: string;
  workspaceLabel: string;
  name: string;
  label: string;
}

/** What one workspace says needs the person, for Home's "Needs you". */
export interface StudioWorkspaceAttention {
  workspaceId: string;
  pluginId: string;
  label: string;
  items: StudioAttentionItem[];
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
    const parsed = studioWorkspaceRegistrationSchema.parse(input);
    if (this.workspaces.has(parsed.id)) {
      throw new SdkError("conflict", {
        publicMessage: `Studio workspace already registered: ${parsed.id}`,
      });
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
      throw new SdkError("conflict", {
        publicMessage: `Studio workspace id or alias already registered: ${duplicateRequested ?? requestedIds.find((id) => occupiedIds.has(id)) ?? parsed.id}`,
      });
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
    const sourceAttentionProvider = parsed.attentionProvider;
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
      ...(parsed.publishesEntityTypes ? { publishesEntityTypes: true } : {}),
      ...(parsed.section ? { section: parsed.section } : {}),
      ...(parsed.paletteActions
        ? { paletteActions: parsed.paletteActions }
        : {}),
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
      ...(sourceAttentionProvider
        ? {
            attentionProvider: async (
              actor,
            ): Promise<readonly StudioAttentionItem[]> => {
              if (!meetsFloor(actor, parsed.permission)) return [];
              return sourceAttentionProvider(actor);
            },
          }
        : {}),
    };
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  /** Every registered workspace, for offering by floor; access is checked on open. */
  listOffered(): Pick<
    StoredStudioWorkspace,
    "id" | "label" | "permission" | "priority"
  >[] {
    return Array.from(this.workspaces.values()).map(
      ({ id, label, permission, priority }) => ({
        id,
        label,
        permission,
        priority,
      }),
    );
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

  /** The plugins whose workspaces say for themselves what needs the person. */
  pluginsWithAttention(): Set<string> {
    return new Set(
      Array.from(this.workspaces.values())
        .filter((workspace) => workspace.attentionProvider !== undefined)
        .map((workspace) => workspace.pluginId),
    );
  }

  /** A plugin's first page the person may open, by priority. */
  async pageOf(
    pluginId: string,
    actor: StudioWorkspaceActor,
  ): Promise<string | undefined> {
    const candidates = Array.from(this.workspaces.values())
      .filter((workspace) => workspace.pluginId === pluginId)
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    for (const workspace of candidates)
      if (await workspace.accessHandler(actor)) return workspace.id;
    return undefined;
  }

  /** What needs the person, from every workspace they may open, by priority. */
  /**
   * The actions a caller may run from ⌘K: offered by a workspace that admits
   * them, at a permission they hold. The action handler checks again when one
   * runs.
   */
  async listPaletteActions(
    actor: StudioWorkspaceActor,
  ): Promise<StudioPaletteWorkspaceAction[]> {
    const sorted = Array.from(this.workspaces.values())
      .filter((workspace) => (workspace.paletteActions?.length ?? 0) > 0)
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const admitted = await Promise.all(
      sorted.map(async (workspace) =>
        (await workspace.accessHandler(actor)) ? workspace : undefined,
      ),
    );
    return admitted.flatMap((workspace) =>
      (workspace?.paletteActions ?? [])
        .filter((action) => meetsFloor(actor, action.permission ?? "trusted"))
        .map((action) => ({
          workspaceId: workspace?.id ?? "",
          workspaceLabel: workspace?.label ?? "",
          name: action.name,
          label: action.label,
        })),
    );
  }

  async listAttention(
    actor: StudioWorkspaceActor,
  ): Promise<StudioWorkspaceAttention[]> {
    const sorted = Array.from(this.workspaces.values()).sort(
      (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
    );
    const resolved = await Promise.all(
      sorted.map((workspace) => resolveAttention(workspace, actor)),
    );
    return resolved.filter(
      (entry): entry is StudioWorkspaceAttention => entry !== undefined,
    );
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
            permission: workspace.permission,
            ...(workspace.urlQuery ? { urlQuery: true } : {}),
            ...(workspace.aliases ? { aliases: workspace.aliases } : {}),
            entityTypes:
              typeof workspace.entityTypes === "function"
                ? await workspace.entityTypes(actor)
                : workspace.entityTypes,
            ...(workspace.publishesEntityTypes
              ? { publishesEntityTypes: true }
              : {}),
            // A workspace that names no section belongs to Brain.
            section: workspace.section ?? "brain",
            ...(badge !== undefined ? { badge } : {}),
          };
          return descriptor;
        }),
    );
  }
}

/** One workspace's attention, or none when it fails or says nothing. */
async function resolveAttention(
  workspace: StoredStudioWorkspace,
  actor: StudioWorkspaceActor,
): Promise<StudioWorkspaceAttention | undefined> {
  if (!workspace.attentionProvider) return undefined;
  if (!(await workspace.accessHandler(actor))) return undefined;
  try {
    const items = z
      .array(studioAttentionItemSchema)
      .parse(await workspace.attentionProvider(actor));
    return items.length > 0
      ? {
          workspaceId: workspace.id,
          pluginId: workspace.pluginId,
          label: workspace.label,
          items,
        }
      : undefined;
  } catch {
    // A source that cannot say what needs the person is left out; Home
    // keeps the rest.
    return undefined;
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
