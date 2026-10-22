import { systemFixtures } from "../fixtures/studio-system";
import type { StudioStudyState } from "../fixtures/studio-study-state";

/** Every captured surface, in capture order. */
export function consoleSurfaces(): string[] {
  return [
    "dashboard",
    "dashboard-knowledge",
    "dashboard-network",
    "studio-library",
    "studio-navigation",
    "studio-navigation-collapsed",
    "studio-overview",
    "studio-chat",
    "studio-chat-sessions",
    "studio-chat-context",
    "studio-inbox",
    "studio-content-sync",
    "studio-site",
    "studio-publishing",
    "studio-board",
    "studio-board-open",
    "studio-administration",
    "studio-administration-invitations",
    "studio-administration-invitations-form",
    "studio-administration-audit",
    "studio-account",
    "studio-editor",
    "studio-system",
    "studio-system-prompt-collection",
    "studio-system-agent-collection",
    ...[...systemFixtures.keys()]
      .filter((key) => key !== "style-guide")
      .map((key) => `studio-system-${key}`),
    "studio-delete",
    "studio-conflict",
    "studio-invalid",
    "studio-upload",
  ];
}

/**
 * Secondary editor states are pinned at desktop and phone; tablet adds no
 * distinct composition for these overlays and lines.
 */
export function isStudioSecondarySurface(surface: string): boolean {
  return (
    surface === "studio-delete" ||
    surface === "studio-conflict" ||
    surface === "studio-invalid" ||
    surface === "studio-upload"
  );
}

/**
 * Studio splits into two phone layout contracts: app-shell surfaces (the
 * editor and its dialogs) hold fixed chrome around scrolling panes, while
 * reading surfaces scroll the document like any other page.
 */
export function isStudioAppShellSurface(surface: string): boolean {
  return (
    surface === "studio-editor" ||
    (surface.startsWith("studio-system") && !surface.endsWith("-collection")) ||
    surface === "studio-delete" ||
    surface === "studio-conflict" ||
    surface === "studio-invalid" ||
    surface === "studio-upload"
  );
}

/** Workspace surfaces captured at their own Studio workspace. */
const WORKSPACE_SURFACES: Partial<Record<string, string>> = {
  "studio-account": "studio:account",
  "studio-overview": "studio:overview",
  "studio-inbox": "unified-inbox:inbox",
  "studio-content-sync": "directory-sync:sync",
  "studio-site": "site-builder:site",
  "studio-publishing": "content-pipeline:publishing",
  "studio-board": "action-board:board",
  "studio-board-open": "action-board:board",
};

function workspaceRoute(id: string): string {
  return `/studio/workspaces/${encodeURIComponent(id)}`;
}

/**
 * Whether a viewport captures a surface. The 1024 desktop keeps the section
 * nav beside the content, the narrowest content a workspace gets on desktop;
 * the library and editor have their own pinned layouts there.
 */
export function viewportCapturesSurface(
  surface: string,
  viewport: { width: number },
): boolean {
  if (viewport.width === 768) return !isStudioSecondarySurface(surface);
  if (viewport.width === 1024)
    return (
      WORKSPACE_SURFACES[surface] !== undefined ||
      surface.startsWith("studio-administration")
    );
  return true;
}

export interface SurfacePlan {
  /** Studio System surfaces swap the fixture type list to the system types. */
  reviewingSystem: boolean;
  systemCollection: boolean;
  systemType: string;
  isDashboard: boolean;
  isStudioSecondary: boolean;
  isStudioEditor: boolean;
  /** Path and query suffix (after `?climate=…`) the capture opens. */
  route: string;
  workspaceQuery: string;
}

export function planSurface(
  surface: string,
  studyState: StudioStudyState | undefined,
): SurfacePlan {
  const isStudioSecondary = isStudioSecondarySurface(surface);
  const reviewingSystem = surface.startsWith("studio-system");
  const systemCollection = reviewingSystem && surface.endsWith("-collection");
  const systemType =
    surface === "studio-system"
      ? "style-guide"
      : surface.slice(
          "studio-system-".length,
          systemCollection ? -"-collection".length : undefined,
        );
  const isDashboard = surface.startsWith("dashboard");
  const isStudioEditor =
    surface === "studio-editor" ||
    (reviewingSystem && !systemCollection) ||
    isStudioSecondary;
  const route = isDashboard
    ? "/dashboard"
    : surface.startsWith("studio-chat")
      ? "/chat"
      : surface.startsWith("studio-administration")
        ? workspaceRoute("admin:administration")
        : surface.startsWith("studio-system")
          ? `/studio/entities/${systemType}${systemCollection ? "" : `/${systemType}`}`
          : WORKSPACE_SURFACES[surface] !== undefined
            ? workspaceRoute(WORKSPACE_SURFACES[surface])
            : isStudioEditor
              ? "/studio/entities/posts/field-notes"
              : "/studio/entities/posts";
  const workspaceQuery =
    surface === "studio-board-open"
      ? "&card=partner-update"
      : surface.startsWith("studio-administration-invitations")
        ? `&tab=invitations`
        : surface === "studio-administration-audit"
          ? `&tab=audit`
          : surface.startsWith("studio-chat") && studyState !== "empty"
            ? `&session=responsive`
            : "";
  return {
    reviewingSystem,
    systemCollection,
    systemType,
    isDashboard,
    isStudioSecondary,
    isStudioEditor,
    route,
    workspaceQuery,
  };
}
