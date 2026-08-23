import { getActiveAuthService } from "@brains/auth-service";
import type {
  StudioWorkspaceRegistration,
  StudioWorkspaceRegistrationResult,
  StudioWorkspaceUnregistration,
  ServicePluginContext,
  UserPermissionLevel,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
  ServicePlugin,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { StudioEntityDisplayMap } from "./config";
import {
  normalizeStudioBasePath,
  studioCreatePath,
  studioEntityPath,
  studioWorkspacePath,
} from "./studio-paths";
import { createStudioCreatePrefillState } from "./create-prefill-contract";
import { createEditorRoutes } from "./editor-routes";
import { StudioWorkspaceRegistry } from "./workspace-registry";
import packageJson from "../package.json";
import { getErrorMessage } from "@brains/utils/error";
import { registerStudioAuditWorkspace } from "./audit-workspace";

interface StudioEntityDisplayEntry {
  label?: string | undefined;
  pluralName?: string | undefined;
}

interface StudioPluginConfig {
  entityDisplay?: Record<string, StudioEntityDisplayEntry> | undefined;
  routePath: string;
}

interface StudioPluginConfigInput {
  entityDisplay?: Record<string, StudioEntityDisplayEntry> | undefined;
  routePath?: string | undefined;
}

const entityDisplayEntrySchema: z.ZodType<
  StudioEntityDisplayEntry,
  StudioEntityDisplayEntry
> = z.looseObject({
  label: z.string().optional(),
  pluralName: z.string().optional(),
});

const entityDisplaySchema = z.record(z.string(), entityDisplayEntrySchema);

const studioPluginConfigSchema: z.ZodType<
  StudioPluginConfig,
  StudioPluginConfigInput
> = z.object({
  entityDisplay: entityDisplaySchema.optional(),
  routePath: z
    .string()
    .default("/studio")
    .refine((routePath) => normalizeStudioBasePath(routePath) !== "/cms", {
      message: '"/cms" is reserved for the Studio redirect',
    }),
});

function parseEntityDisplay(
  value: unknown,
): StudioEntityDisplayMap | undefined {
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
 * First-party Studio editor: a React app served at `routePath`, gated on the
 * authenticated passkey session, whose reads and writes go through the entity
 * service. Git persistence follows via directory-sync + git-sync — no
 * repository credential is ever sent to the browser.
 */
export class StudioPlugin extends ServicePlugin<
  StudioPluginConfig,
  StudioPluginConfigInput
> {
  private readonly workspaceRegistry = new StudioWorkspaceRegistry();

  constructor(config: StudioPluginConfigInput = {}) {
    super("studio", packageJson, config, studioPluginConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.endpoints.register({
      label: "Studio",
      url: this.config.routePath,
      priority: 40,
      visibility: "trusted",
    });
    context.interactions.register({
      id: "studio",
      label: "Studio",
      description: "Edit and manage content through the browser Studio.",
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
          href: studioCreatePath(this.config.routePath, "note"),
          state: createStudioCreatePrefillState(
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
              href: studioEntityPath(
                this.config.routePath,
                item.entityRef.entityType,
                item.entityRef.entityId,
              ),
            }
          : undefined,
    });

    context.messaging.subscribe<
      StudioWorkspaceRegistration,
      StudioWorkspaceRegistrationResult
    >(STUDIO_WORKSPACE_REGISTER_MESSAGE, async (message) => {
      try {
        const workspace = this.workspaceRegistry.register(message.payload);
        return {
          success: true,
          data: {
            workspaceUrl: studioWorkspacePath(
              this.config.routePath,
              workspace.id,
            ),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    });
    context.messaging.subscribe<StudioWorkspaceUnregistration>(
      STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
      (message) => {
        this.workspaceRegistry.unregister(
          message.payload.pluginId,
          message.payload.workspaceId,
        );
        return { success: true };
      },
    );
  }

  protected override async onRegistrationComplete(
    context: ServicePluginContext,
  ): Promise<void> {
    await registerStudioAuditWorkspace(context);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    const editorRoutes = createEditorRoutes({
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
    const redirect = legacyCmsRedirect(this.config.routePath);
    return redirect ? [redirect, ...editorRoutes] : editorRoutes;
  }
}

function legacyCmsRedirect(routePath: string): WebRouteDefinition | undefined {
  const studioBase = normalizeStudioBasePath(routePath);
  if (studioBase === "/cms") return undefined;
  return {
    path: "/cms",
    match: "prefix",
    method: "GET",
    public: true,
    handler: (request): Response => {
      const source = new URL(request.url);
      const suffix = source.pathname === "/cms" ? "" : source.pathname.slice(4);
      const destinationPath = `${studioBase}${suffix}` || "/";
      const location = `${destinationPath}${source.search}`;
      return new Response(null, {
        status: 308,
        headers: { Location: location, "Cache-Control": "no-store" },
      });
    },
  };
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

export function studioPlugin(
  config: StudioPluginConfigInput = {},
): StudioPlugin {
  return new StudioPlugin(config);
}
