import {
  CHAT_INTERACTION_ID,
  STUDIO_INTERACTION_ID,
  SdkError,
  consoleJumpDestinationsContract,
} from "@brains/contracts";
import type { UserPermissionLevel } from "@brains/sdk/interfaces";
import {
  studioOverviewContributionRegisterContract,
  studioOverviewContributionUnregisterContract,
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
  serviceRuntime,
  withWebRoutes,
} from "@brains/sdk/internal/service-runtime";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { z } from "@brains/utils/zod";
import type { StudioEntityDisplayMap } from "./config";
import {
  studioCreatePath,
  studioEntityPath,
  studioWorkspacePath,
} from "./studio-paths";
import { createStudioCreatePrefillState } from "./create-prefill-contract";
import { createEditorRoutes, resolveStudioChatApiPath } from "./editor-routes";
import { studioJumpDestinations } from "./jump-destinations";
import { createStudioChatHandoffState } from "./chat-handoff-contract";
import { registerGroupingDefinitions } from "./grouping-definitions";
import type { GroupingDefinitionSource } from "./grouping-definition-source";
import type { GroupingDefinitionsSnapshot } from "./grouping-definitions-contract";
import { groupingDefinitionsEntity } from "./entity/grouping-definitions-entity";
import { StudioWorkspaceRegistry } from "./workspace-registry";
import { studioContextOf, type StudioContext } from "./studio-context";

import { STUDIO_ACCOUNT_WORKSPACE_ID } from "./account-workspace";
import {
  STUDIO_CHAT_ROUTE_PATH,
  STUDIO_CHAT_WORKSPACE_ID,
} from "./chat-workspace";
import {
  STUDIO_OVERVIEW_WORKSPACE_ID,
  StudioOverviewRegistry,
  createStudioOverviewWorkspace,
  registerStudioOverviewActivity,
} from "./overview-workspace";

const entityDisplayEntrySchema: z.ZodObject<
  {
    label: z.ZodOptional<z.ZodString>;
  },
  z.core.$loose
> = z.looseObject({
  label: z.string().optional(),
});

const entityDisplaySchema: z.ZodRecord<
  z.ZodString,
  typeof entityDisplayEntrySchema
> = z.record(z.string(), entityDisplayEntrySchema);

export const studioPluginConfigSchema: z.ZodObject<
  {
    entityDisplay: z.ZodOptional<typeof entityDisplaySchema>;
    routePath: z.ZodDefault<z.ZodString>;
  },
  z.core.$strict
> = z.strictObject({
  entityDisplay: entityDisplaySchema.optional(),
  routePath: z.string().default("/studio"),
});

export type StudioPluginConfigInput = z.input<typeof studioPluginConfigSchema>;

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
  context: StudioContext,
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
  context: StudioContext,
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

/** What Studio holds once set up, which its editor routes are built from. */
interface StudioState {
  readonly context: StudioContext;
  readonly workspaceRegistry: StudioWorkspaceRegistry;
  /** The grouping definitions as last read; none until every plugin registered. */
  readonly groupingDefinitions: () => GroupingDefinitionsSnapshot;
  readonly entityDisplay: () => StudioEntityDisplayMap | undefined;
}

/**
 * First-party Studio editor: a React app served at `routePath`, gated on the
 * authenticated passkey session, whose reads and writes go through the entity
 * service. Git persistence follows via directory-sync + git-sync — no
 * repository credential is ever sent to the browser. It owns the brain's
 * grouping definitions type, installed beside it as grouping-definitions.
 */
const studioService = defineServicePlugin({
  id: "studio",
  config: studioPluginConfigSchema,
  entities: [groupingDefinitionsEntity],
  setup: (slot): StudioState => {
    const runtime = serviceRuntime(slot);
    const context = studioContextOf(runtime);
    const { routePath } = slot.config;
    const entityDisplay = (): StudioEntityDisplayMap | undefined =>
      slot.config.entityDisplay ?? parseEntityDisplay(context.entityDisplay);
    const workspaceRegistry = new StudioWorkspaceRegistry();
    const overviewRegistry = new StudioOverviewRegistry();
    let definitionSource: GroupingDefinitionSource | undefined;

    // Once every plugin has registered, as the class's
    // onRegistrationComplete ran: the definitions document is the only
    // source of groupings.
    runtime.registered(() => {
      if (runtime.groupings().getGroupings().length > 0)
        throw new Error(
          "Studio groupings must be defined in the Groupings document, not registered by another owner.",
        );
      definitionSource = registerGroupingDefinitions(
        context,
        runtime.groupings(),
      );
    });

    // The shell catalogs plugins before registration, but HTTP routes are
    // readable only after finalization. Use the same presence gate as the
    // Chat shell; it resolves the configured API path when handling requests.
    if (runtime.hasPlugin("web-chat")) {
      runtime.endpoint({
        label: "Chat",
        url: STUDIO_CHAT_ROUTE_PATH,
        priority: 15,
        visibility: "trusted",
        requiresActiveSession: true,
      });
      runtime.interaction({
        id: CHAT_INTERACTION_ID,
        label: "Chat",
        description: "Chat with this brain in the browser.",
        href: STUDIO_CHAT_ROUTE_PATH,
        kind: "human",
        priority: 15,
        visibility: "trusted",
        requiresActiveSession: true,
      });
      runtime.inboxFollowUpKind({
        kind: "discuss-in-chat",
        label: "Discuss in chat",
        priority: 10,
        mode: "universal",
        permissionLevel: "trusted",
        applies: () => true,
        resolve: ({ sourceId, item }) => {
          if (!runtime.inbox.getSource(sourceId)?.resolveDetail)
            return undefined;
          const label = item.title
            .replace(/[\p{Cc}\p{Cf}]/gu, " ")
            .trim()
            .slice(0, 160);
          return {
            href: STUDIO_CHAT_ROUTE_PATH,
            state: createStudioChatHandoffState(
              sourceId,
              item.id,
              label || "Inbox item",
            ),
          };
        },
      });
    }
    runtime.endpoint({
      label: "Studio",
      url: routePath,
      priority: 40,
      visibility: "public",
      requiresActiveSession: true,
    });
    runtime.interaction({
      id: STUDIO_INTERACTION_ID,
      label: "Studio",
      description: "Edit and manage content through the browser Studio.",
      href: routePath,
      kind: "admin",
      priority: 40,
      visibility: "public",
      requiresActiveSession: true,
    });
    workspaceRegistry.register(
      createStudioOverviewWorkspace({ context, registry: overviewRegistry }),
    );
    registerStudioOverviewActivity(
      context,
      runtime.listen,
      overviewRegistry,
      entityDisplay,
    );
    runtime.answer(
      consoleJumpDestinationsContract,
      async ({ request: { permissionLevel } }) =>
        studioJumpDestinations({
          context,
          routePath,
          permissionLevel,
          workspaceRegistry,
          hasChat: resolveStudioChatApiPath(context) !== undefined,
          entityDisplay: entityDisplay(),
        }),
    );
    runtime.answer(
      studioOverviewContributionRegisterContract,
      async ({ request }) => {
        overviewRegistry.register(request);
      },
    );
    runtime.answer(
      studioOverviewContributionUnregisterContract,
      async ({ request }) => {
        overviewRegistry.unregister(request);
      },
    );

    const canCreateNote = createNoteCapability(context);
    runtime.inboxFollowUpKind({
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
          href: studioCreatePath(routePath, "note"),
          state: createStudioCreatePrefillState(
            item.title,
            entityBacklink(item.entityRef.entityType, item.entityRef.entityId),
            safeInboxSummary(item.summary),
          ),
        };
      },
    });
    runtime.inboxFollowUpKind({
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
                routePath,
                item.entityRef.entityType,
                item.entityRef.entityId,
              ),
            }
          : undefined,
    });

    runtime.answer(
      studioWorkspaceRegisterContract,
      async ({ request: registration }) => {
        if (
          registration.id === STUDIO_ACCOUNT_WORKSPACE_ID ||
          registration.id === STUDIO_CHAT_WORKSPACE_ID ||
          registration.id === STUDIO_OVERVIEW_WORKSPACE_ID
        ) {
          throw new SdkError("invalid_input", {
            publicMessage: `Studio workspace id is reserved by the host: ${registration.id}`,
          });
        }
        const workspace = workspaceRegistry.register(registration);
        return {
          workspaceUrl: studioWorkspacePath(routePath, workspace.id),
        };
      },
    );
    runtime.answer(
      studioWorkspaceUnregisterContract,
      async ({ request: { pluginId, workspaceId } }) => {
        if (pluginId !== "studio") {
          workspaceRegistry.unregister(pluginId, workspaceId);
        }
      },
    );

    return {
      context,
      workspaceRegistry,
      entityDisplay,
      groupingDefinitions: () =>
        definitionSource?.getSnapshot() ?? {
          groupings: {},
          issues: [],
          excludedTypes: [],
        },
    };
  },
});

/** Studio, as a brain composes it: the editor and the type it owns. */
export function createStudioPackage(): ServicePackageDefinition<
  typeof studioPluginConfigSchema
> {
  return withWebRoutes<typeof studioPluginConfigSchema, StudioState>(
    studioService,
    ({ config, state }) =>
      createEditorRoutes({
        routePath: config.routePath,
        getContext: () => state.context,
        resolveAuthPrincipal: (request) =>
          state.context.auth()?.resolveSession(request) ??
          Promise.resolve(undefined),
        getEntityDisplay: state.entityDisplay,
        workspaceRegistry: state.workspaceRegistry,
        getGroupingDefinitions: state.groupingDefinitions,
        recordAuditEvent: async (event) => {
          await state.context.auth()?.recordAuditEvent(event);
        },
        listMembers: () => state.context.assignableMembers(),
      }),
  );
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
