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
  ]),
  priority: z.number().int(),
  entityTypes: z.array(z.string().trim().min(1)).default([]),
  dataProvider: z.custom<() => Promise<unknown>>(
    (value) => typeof value === "function",
    { message: "Expected CMS workspace data provider function" },
  ),
  actionHandler: z
    .custom<NonNullable<CmsWorkspaceRegistration["actionHandler"]>>(
      (value) => typeof value === "function",
      { message: "Expected CMS workspace action handler function" },
    )
    .optional(),
});

export interface StoredCmsWorkspace extends CmsWorkspaceDescriptor {
  dataProvider: () => Promise<unknown>;
  actionHandler?: CmsWorkspaceRegistration["actionHandler"];
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
      dataProvider: parsed.dataProvider,
      ...(parsed.actionHandler ? { actionHandler: parsed.actionHandler } : {}),
    };
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  get(id: string): StoredCmsWorkspace | undefined {
    return this.workspaces.get(id);
  }

  listDescriptors(): CmsWorkspaceDescriptor[] {
    return Array.from(this.workspaces.values())
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
      .map(({ id, pluginId, label, rendererName, priority, entityTypes }) => ({
        id,
        pluginId,
        label,
        rendererName,
        priority,
        entityTypes,
      }));
  }
}
