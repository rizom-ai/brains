import {
  defineRoute,
  defineServicePlugin,
  SdkError,
  defineSubscription,
  verbatim,
  type AnyInterfaceRouteDefinition,
  STUDIO_OVERVIEW_REGISTER_MESSAGE,
  STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type {
  StudioOverviewContributionRegistration,
  StudioWorkspaceRegistration,
} from "@brains/sdk/plugins";
import { ENTITY_CHANNELS, JOB_CHANNELS } from "@brains/contracts";
import {
  studioConfigSchema,
  parseEntityDisplay,
  type StudioEntityDisplayMap,
} from "./config";
import {
  normalizeStudioBasePath,
  studioCreatePath,
  studioEntityPath,
  studioWorkspacePath,
} from "./studio-paths";
import { createStudioCreatePrefillState } from "./create-prefill-contract";
import { createEditorRoutes, type EditorRouteState } from "./editor-routes";
import { StudioWorkspaceRegistry } from "./workspace-registry";
import { STUDIO_ACCOUNT_WORKSPACE_ID } from "./account-workspace";
import { STUDIO_CHAT_WORKSPACE_ID } from "./chat-workspace";
import {
  STUDIO_OVERVIEW_WORKSPACE_ID,
  StudioOverviewRegistry,
  createStudioOverviewWorkspace,
} from "./overview-workspace";
import type { StudioRuntime } from "./runtime";

/** What Studio holds while it runs. */
export interface StudioState {
  readonly runtime: StudioRuntime;
  /** The brain's own labels for its types, when it configured any. */
  readonly entityDisplay: StudioEntityDisplayMap | undefined;
  readonly workspaces: StudioWorkspaceRegistry;
  readonly overview: StudioOverviewRegistry;
}

/**
 * Registries a caller supplies rather than letting the service build them.
 * Only tests pass these; production leaves them unset.
 */
export interface StudioDeps {
  workspaces?: StudioWorkspaceRegistry;
  overview?: StudioOverviewRegistry;
}

/**
 * A workspace announcing itself, as the runtime sends it. The functions are
 * checked to be functions here; the registry validates the rest.
 */
const workspaceRegistrationPayload = z.custom<StudioWorkspaceRegistration>(
  (value) => typeof value === "object" && value !== null && "id" in value,
);
const workspaceUnregistrationPayload = z.object({
  pluginId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
});
const overviewRegistrationPayload =
  z.custom<StudioOverviewContributionRegistration>(
    (value) => typeof value === "object" && value !== null && "id" in value,
  );
const overviewUnregistrationPayload = z.object({
  pluginId: z.string().min(1),
  contributionId: z.string().min(1).optional(),
});

function permanentRedirect(location: string): Response {
  return new Response(null, {
    status: 308,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

/**
 * Where the console used to live. A bookmark to /cms or /account still
 * lands, at the mount the brain configured.
 */
function legacySurfaceRedirects(
  routePath: string,
): AnyInterfaceRouteDefinition[] {
  const studioBase = normalizeStudioBasePath(routePath);
  const studioHome = studioBase || "/";
  return [
    defineRoute({
      method: "GET",
      path: "/cms",
      match: "prefix",
      security: { kind: "public" },
      response: verbatim,
      handle: ({ request }) => {
        const source = new URL(request.url);
        const suffix =
          source.pathname === "/cms" ? "" : source.pathname.slice(4);
        const destinationPath = `${studioBase}${suffix}` || "/";
        return permanentRedirect(`${destinationPath}${source.search}`);
      },
    }),
    defineRoute({
      method: "GET",
      path: "/account",
      match: "prefix",
      security: { kind: "public" },
      response: verbatim,
      handle: ({ request }) => {
        const source = new URL(request.url);
        return permanentRedirect(
          `${studioWorkspacePath(studioHome, STUDIO_ACCOUNT_WORKSPACE_ID)}${source.search}`,
        );
      },
    }),
    defineRoute({
      method: "GET",
      path: "/admin",
      match: "prefix",
      security: { kind: "public" },
      response: verbatim,
      handle: () => permanentRedirect(studioHome),
    }),
  ];
}

/** Where an inbox item may safely be summarised for a prefilled note. */
function safeInboxSummary(summary: string | undefined): string | undefined {
  if (!summary) return undefined;
  const trimmed = summary.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined;
}

function entityBacklink(entityType: string, entityId: string): string {
  return `entity://${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

/**
 * First-party Studio: a React app served at `routePath`, gated on the
 * signed-in session, whose reads and writes go through the runtime as the
 * person using it. It hosts the workspaces other packages declare and edits
 * every entity type, owning none of them.
 */
export function studioService(
  deps: StudioDeps = {},
): ServicePackageDefinition<typeof studioConfigSchema> {
  return defineServicePlugin(
    {
      id: "studio",
      config: studioConfigSchema,

      setup: ({
        config,
        entities,
        entityShapes,
        operatorEntities,
        messaging,
        judge,
        identity,
        auth,
        channels,
        inbox,
        inboxFollowUps,
        plugins,
        surfaces,
        themeCSS,
        readiness,
        entityDisplay,
        logger,
      }): StudioState => {
        const runtime: StudioRuntime = {
          entities,
          shapes: entityShapes,
          operator: operatorEntities,
          messaging,
          judge,
          identity,
          auth,
          channels,
          inbox,
          plugins,
          surfaces,
          themeCSS,
          readiness,
          logger,
        };
        const workspaces = deps.workspaces ?? new StudioWorkspaceRegistry();
        const overview = deps.overview ?? new StudioOverviewRegistry();
        workspaces.register(
          createStudioOverviewWorkspace({ runtime, registry: overview }),
        );

        // An inbox item can become a note, or open the entity it came from.
        // Whether a person may create a note depends on the person, never on
        // the item, so it is answered once per level.
        const canCreateNote = (
          permission: "admin" | "trusted" | "public",
        ): boolean =>
          entities.getEntityTypes().includes("note") &&
          operatorEntities.allows("note", "create", {
            actor: { id: "inbox-follow-up" },
            permission,
            isAnchor: false,
          });
        inboxFollowUps.registerKind({
          kind: "capture-as-note",
          label: "Capture as note",
          priority: 20,
          mode: "universal",
          permissionLevel: "trusted",
          applies: ({ item, actor }) =>
            item.entityRef !== undefined &&
            canCreateNote(actor.permissionLevel),
          resolve: ({ item, actor }) => {
            if (!item.entityRef || !canCreateNote(actor.permissionLevel)) {
              return undefined;
            }
            return {
              href: studioCreatePath(config.routePath, "note"),
              state: createStudioCreatePrefillState(
                item.title,
                entityBacklink(
                  item.entityRef.entityType,
                  item.entityRef.entityId,
                ),
                safeInboxSummary(item.summary),
              ),
            };
          },
        });
        inboxFollowUps.registerKind({
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
                    config.routePath,
                    item.entityRef.entityType,
                    item.entityRef.entityId,
                  ),
                }
              : undefined,
        });

        return {
          runtime,
          workspaces,
          overview,
          entityDisplay:
            config.entityDisplay ?? parseEntityDisplay(entityDisplay),
        };
      },
    },
    {
      interactions: ({ config }) => [
        {
          id: "studio",
          label: "Studio",
          description: "Edit and manage content through the browser Studio.",
          href: config.routePath,
          kind: "admin",
          priority: 40,
          visibility: "public",
          requiresActiveSession: true,
        },
      ],

      // Workspaces and overview contributions arrive from the packages that
      // declared them; entity and job activity arrives from the runtime.
      subscriptions: ({ config, state }) => [
        defineSubscription({
          topic: STUDIO_WORKSPACE_REGISTER_MESSAGE,
          payload: workspaceRegistrationPayload,
          // A refusal is thrown: the runtime answers the sender with it.
          handle: ({ payload }) => {
            if (
              payload.id === STUDIO_ACCOUNT_WORKSPACE_ID ||
              payload.id === STUDIO_CHAT_WORKSPACE_ID ||
              payload.id === STUDIO_OVERVIEW_WORKSPACE_ID
            ) {
              throw new SdkError("permission_denied", {
                publicMessage: `Studio workspace id is reserved by the host: ${payload.id}`,
              });
            }
            const workspace = state.workspaces.register(payload);
            return {
              workspaceUrl: studioWorkspacePath(config.routePath, workspace.id),
            };
          },
        }),
        defineSubscription({
          topic: STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
          payload: workspaceUnregistrationPayload,
          handle: ({ payload }) => {
            if (payload.pluginId !== "studio") {
              state.workspaces.unregister(
                payload.pluginId,
                payload.workspaceId,
              );
            }
            return {};
          },
        }),
        defineSubscription({
          topic: STUDIO_OVERVIEW_REGISTER_MESSAGE,
          payload: overviewRegistrationPayload,
          handle: ({ payload }) => {
            state.overview.register(payload);
            return {};
          },
        }),
        defineSubscription({
          topic: STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
          payload: overviewUnregistrationPayload,
          handle: ({ payload }) => {
            state.overview.unregister(payload);
            return {};
          },
        }),
        ...(["created", "updated", "deleted"] as const).map((action) =>
          defineSubscription({
            topic: ENTITY_CHANNELS[action],
            payload: z.unknown(),
            handle: ({ payload }) => {
              state.overview.recordEntity(action, payload);
              return {};
            },
          }),
        ),
        defineSubscription({
          topic: JOB_CHANNELS.progress,
          payload: z.unknown(),
          handle: ({ payload }) => {
            state.overview.recordJob(payload);
            return {};
          },
        }),
      ],

      routes: ({ config, state }) => [
        ...legacySurfaceRedirects(config.routePath),
        ...createEditorRoutes(
          (): EditorRouteState => {
            return {
              runtime: state.runtime,
              entityDisplay: state.entityDisplay,
              workspaceRegistry: state.workspaces,
              recordAuditEvent: async (event): Promise<void> => {
                await state.runtime.auth.getAudit()?.recordAuditEvent(event);
              },
            };
          },
          { routePath: config.routePath },
        ),
      ],
    },
  );
}
