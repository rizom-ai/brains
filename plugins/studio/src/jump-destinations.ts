import type {
  ConsoleJumpDestination,
  SurfacePermissionLevel,
} from "@brains/contracts";
import type { ServicePluginContext } from "@brains/plugins";
import { listBuiltInStudioWorkspaces } from "./account-workspace";
import { STUDIO_CHAT_ROUTE_PATH } from "./chat-workspace";
import { entityTypeLabels, type EntityDisplayLabel } from "./config";
import type { StudioWorkspaceRegistry } from "./workspace-registry";

const RANK: Record<SurfacePermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

/**
 * The pages Studio offers the ⌘K palette for one caller: its workspaces,
 * Chat and Account up front, and every collection on a matching search.
 * Floors here only decide what is offered; each page still checks access.
 */
export function studioJumpDestinations(options: {
  context: ServicePluginContext;
  routePath: string;
  permissionLevel: SurfacePermissionLevel;
  workspaceRegistry: StudioWorkspaceRegistry;
  hasChat: boolean;
  entityDisplay: Partial<Record<string, EntityDisplayLabel>> | undefined;
}): ConsoleJumpDestination[] {
  const base = options.routePath.replace(/\/+$/, "");
  const rank = RANK[options.permissionLevel];
  const workspaceHref = (id: string): string =>
    `${base}/workspaces/${encodeURIComponent(id)}`;

  const workspaces = [
    ...options.workspaceRegistry
      .listOffered()
      .filter((workspace) => RANK[workspace.permission] <= rank),
    ...listBuiltInStudioWorkspaces(options.permissionLevel),
  ]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map((workspace) => ({
      id: `studio/${workspace.id}`,
      title: workspace.label,
      sub: "Studio",
      href: workspaceHref(workspace.id),
      primary: true,
    }));

  const chat =
    options.hasChat && rank >= RANK.trusted
      ? [
          {
            id: "studio/chat",
            title: "Chat",
            sub: "Studio",
            href: STUDIO_CHAT_ROUTE_PATH,
            primary: true,
          },
        ]
      : [];

  const { entityService } = options.context;
  const collections =
    rank >= RANK.trusted
      ? entityService
          .getEntityTypes()
          .filter(
            (type) =>
              entityService.getEntityTypeConfig(type).containedIn === undefined,
          )
          .map((type) => ({
            id: `studio/entities/${type}`,
            title: entityTypeLabels(type, options.entityDisplay?.[type])
              .pluralLabel,
            sub:
              entityService.getEntityTypeConfig(type).classification ===
              "system"
                ? "System"
                : "Library",
            href: `${base}/entities/${encodeURIComponent(type)}`,
          }))
      : [];

  return [
    ...workspaces.slice(0, 1),
    ...chat,
    ...workspaces.slice(1),
    ...collections,
  ];
}
