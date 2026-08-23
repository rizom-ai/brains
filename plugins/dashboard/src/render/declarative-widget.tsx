/** @jsxImportSource react */
import {
  safeParseRuntimeDashboardWidgetData,
  type RuntimeStudioWorkspaceData,
  type RuntimeOperatorActionControl,
  type RuntimeOperatorLaunchIntent,
  type RuntimeOperatorLinkTarget,
} from "@brains/plugins";
import { OperatorViewRenderer } from "@brains/operator-view-react";
import type { JSX } from "react";
import type { RenderableWidgetData } from "./types";

interface OperatorLaunchPaths {
  readonly accountPath?: string | undefined;
  readonly adminPath?: string | undefined;
  readonly studioPath?: string | undefined;
}

function entityHref(basePath: string, entityType: string, id: string): string {
  const base = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  return `${base}/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}`;
}

function workspaceHref(studioPath: string, workspaceId: string): string {
  const base = studioPath === "/" ? "" : studioPath.replace(/\/+$/, "");
  return `${base}/workspaces/${encodeURIComponent(workspaceId)}`;
}

function inboxLaunchHref(
  studioPath: string,
  launch: Extract<RuntimeOperatorLaunchIntent, { target: "inbox" }>,
): string {
  const url = new URL(
    workspaceHref(studioPath, "unified-inbox:inbox"),
    "https://brains.invalid",
  );
  if ("source" in launch) {
    url.searchParams.set("sourceId", "mail-items");
    if (launch.filter === "high-priority") {
      url.searchParams.set("facet.mail-priority", "high");
    } else if (launch.filter === "needs-reply") {
      url.searchParams.set("facet.needs-reply", "true");
    } else if (launch.filter === "unclassified") {
      url.searchParams.set("facet.category", "unclassified");
    }
  }
  return `${url.pathname}${url.search}`;
}

function launchHref(
  launch: RuntimeOperatorLaunchIntent,
  paths: OperatorLaunchPaths,
): string | undefined {
  if (launch.target === "account-settings") return paths.accountPath;
  if (launch.target === "admin-peer-invite") {
    if (!paths.adminPath) return undefined;
    const url = new URL(paths.adminPath, "https://brains.invalid");
    url.searchParams.set("peerId", launch.peerId);
    url.searchParams.set("displayName", launch.displayName);
    return `${url.pathname}${url.search}`;
  }
  if (!paths.studioPath) return undefined;
  switch (launch.target) {
    case "inbox":
      return inboxLaunchHref(paths.studioPath, launch);
    case "publishing":
      return workspaceHref(paths.studioPath, "content-pipeline:publishing");
    case "site":
      return workspaceHref(paths.studioPath, "site-builder:site");
    case "inbox-open-entity":
    case "inbox-discuss-in-chat":
    case "inbox-capture-note":
      return undefined;
  }
}

function resolveLink(
  target: RuntimeOperatorLinkTarget,
  paths: OperatorLaunchPaths,
): string | undefined {
  if (target.kind === "external") return target.href;
  if (target.kind === "launch") return launchHref(target.launch, paths);
  if (target.kind === "detail") return undefined;
  return paths.studioPath
    ? entityHref(paths.studioPath, target.entityType, target.id)
    : undefined;
}

const ignoreAction = async (
  _action: RuntimeOperatorActionControl,
): Promise<unknown> => undefined;

export function DeclarativeWidgetBody({
  widget,
  launchPaths,
}: {
  widget: RenderableWidgetData;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  const parsed = safeParseRuntimeDashboardWidgetData(widget.data);
  if (!parsed.success) {
    return <p className="operator-empty">Widget data is unavailable.</p>;
  }
  if (parsed.data.view.blocks.length === 0) {
    return (
      <div className="operator-view">
        {parsed.data.view.title && (
          <h4 className="operator-view-title">{parsed.data.view.title}</h4>
        )}
        <p className="operator-empty">No widget details.</p>
      </div>
    );
  }

  const data: RuntimeStudioWorkspaceData = { view: parsed.data.view };
  return (
    <OperatorViewRenderer
      data={data}
      onAction={ignoreAction}
      onOpenEntity={() => {}}
      resolveLink={(target) => resolveLink(target, launchPaths)}
      renderAllTabs
    />
  );
}
