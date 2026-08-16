import { getActiveAuthService } from "@brains/auth-service";
import type {
  CmsWorkspaceRegistration,
  CmsWorkspaceRegistrationResult,
  CmsWorkspaceUnregistration,
  ServicePluginContext,
  UserPermissionLevel,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  CMS_WORKSPACE_UNREGISTER_MESSAGE,
  ServicePlugin,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { CmsEntityDisplayMap } from "./config";
import { cmsCreatePath, cmsEntityPath, cmsWorkspacePath } from "./cms-paths";
import { createCmsCreatePrefillState } from "./create-prefill-contract";
import { createEditorRoutes } from "./editor-routes";
import { CmsWorkspaceRegistry } from "./workspace-registry";
import packageJson from "../package.json";
import { getErrorMessage } from "@brains/utils/error";

interface CmsEntityDisplayEntry {
  label?: string | undefined;
  pluralName?: string | undefined;
}

interface CmsPluginConfig {
  entityDisplay?: Record<string, CmsEntityDisplayEntry> | undefined;
  routePath: string;
}

interface CmsPluginConfigInput {
  entityDisplay?: Record<string, CmsEntityDisplayEntry> | undefined;
  routePath?: string | undefined;
}

const entityDisplayEntrySchema: z.ZodType<
  CmsEntityDisplayEntry,
  CmsEntityDisplayEntry
> = z.looseObject({
  label: z.string().optional(),
  pluralName: z.string().optional(),
});

const entityDisplaySchema = z.record(z.string(), entityDisplayEntrySchema);

const cmsPluginConfigSchema: z.ZodType<CmsPluginConfig, CmsPluginConfigInput> =
  z.object({
    entityDisplay: entityDisplaySchema.optional(),
    routePath: z.string().default("/cms"),
  });

function parseEntityDisplay(value: unknown): CmsEntityDisplayMap | undefined {
  const parsed = entityDisplaySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Note-creation capability depends on the actor, never on the item, but the
 * follow-up registry evaluates predicates and resolvers per item. Memoize by
 * permission level so a page of entries costs one check instead of one per
 * entry — and so a denied actor does not construct an exception per entry.
 */
function createNoteCapability(
  context: ServicePluginContext,
): (permissionLevel: UserPermissionLevel) => boolean {
  const cache = new Map<UserPermissionLevel, boolean>();
  return (permissionLevel) => {
    const cached = cache.get(permissionLevel);
    if (cached !== undefined) return cached;
    const allowed = context.entityService.getEntityTypes().includes("note")
      ? allowsNoteCreation(context, permissionLevel)
      : false;
    cache.set(permissionLevel, allowed);
    return allowed;
  };
}

function allowsNoteCreation(
  context: ServicePluginContext,
  permissionLevel: UserPermissionLevel,
): boolean {
  try {
    context.permissions.assertEntityActionAllowed("note", "create", {
      userPermissionLevel: permissionLevel,
    });
    return true;
  } catch {
    return false;
  }
}

function entityBacklink(entityType: string, entityId: string): string {
  return `entity://${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

/**
 * First-party CMS editor: a React app served at `routePath`, gated on the
 * authenticated passkey session, whose reads and writes go through the entity
 * service. Git persistence follows via directory-sync + git-sync — no
 * repository credential is ever sent to the browser.
 */
export class CmsPlugin extends ServicePlugin<
  CmsPluginConfig,
  CmsPluginConfigInput
> {
  private readonly workspaceRegistry = new CmsWorkspaceRegistry();

  constructor(config: CmsPluginConfigInput = {}) {
    super("cms", packageJson, config, cmsPluginConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.endpoints.register({
      label: "CMS",
      url: this.config.routePath,
      priority: 40,
      visibility: "trusted",
    });
    context.interactions.register({
      id: "cms",
      label: "CMS",
      description: "Edit and manage content through the browser CMS.",
      href: this.config.routePath,
      kind: "admin",
      priority: 40,
      visibility: "trusted",
    });
    const canCreateNote = createNoteCapability(context);
    context.inboxFollowUps.registerKind({
      kind: "capture-as-note",
      label: "Capture as note",
      priority: 20,
      mode: "universal",
      permissionLevel: "trusted",
      applies: ({ item, actor }) =>
        item.entityRef !== undefined && canCreateNote(actor.permissionLevel),
      resolve: ({ item, actor }) => {
        if (!item.entityRef || !canCreateNote(actor.permissionLevel)) {
          return undefined;
        }
        return {
          href: cmsCreatePath(this.config.routePath, "note"),
          state: createCmsCreatePrefillState(
            item.title,
            entityBacklink(item.entityRef.entityType, item.entityRef.entityId),
            safeInboxSummary(item.summary),
          ),
        };
      },
    });
    context.inboxFollowUps.registerKind({
      kind: "open-entity",
      label: "Open source entity",
      priority: 30,
      mode: "universal",
      permissionLevel: "trusted",
      applies: ({ item }) => item.entityRef !== undefined,
      resolve: ({ item }) =>
        item.entityRef
          ? {
              href: cmsEntityPath(
                this.config.routePath,
                item.entityRef.entityType,
                item.entityRef.entityId,
              ),
            }
          : undefined,
    });

    context.messaging.subscribe<
      CmsWorkspaceRegistration,
      CmsWorkspaceRegistrationResult
    >(CMS_WORKSPACE_REGISTER_MESSAGE, async (message) => {
      try {
        const workspace = this.workspaceRegistry.register(message.payload);
        return {
          success: true,
          data: {
            workspaceUrl: cmsWorkspacePath(this.config.routePath, workspace.id),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    });
    context.messaging.subscribe<CmsWorkspaceUnregistration>(
      CMS_WORKSPACE_UNREGISTER_MESSAGE,
      (message) => {
        this.workspaceRegistry.unregister(
          message.payload.pluginId,
          message.payload.workspaceId,
        );
        return { success: true };
      },
    );
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return createEditorRoutes({
      routePath: this.config.routePath,
      getContext: () => this.getContext(),
      resolveAuthPrincipal: (request) =>
        getActiveAuthService()?.resolveSession(request) ??
        Promise.resolve(undefined),
      minimumPermissionLevel: "trusted",
      getEntityDisplay: () =>
        this.config.entityDisplay ??
        parseEntityDisplay(this.getContext().entityDisplay),
      workspaceRegistry: this.workspaceRegistry,
      recordAuditEvent: async (event) => {
        const authService = getActiveAuthService();
        if (authService) await authService.recordAuditEvent(event);
      },
    });
  }
}

function safeInboxSummary(summary: string | undefined): string | undefined {
  if (!summary) return undefined;
  const normalized = Array.from(summary.replace(/\r\n?/g, "\n"))
    .map((character) =>
      character === "\n" ||
      character === "\t" ||
      !/[\p{Cc}\p{Cf}]/u.test(character)
        ? character
        : " ",
    )
    .join("")
    .trim();
  return normalized || undefined;
}

export function cmsPlugin(config: CmsPluginConfigInput = {}): CmsPlugin {
  return new CmsPlugin(config);
}
