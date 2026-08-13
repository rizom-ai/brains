import { normalizeCmsBasePath } from "../../src/cms-paths";
import type { InboxWorkspaceFollowUp } from "./api";

export interface InboxFollowUpNavigation {
  cmsBasePath: string;
  routerPush(href: string, state?: unknown): void;
  browserPushState(state: unknown, title: string, href: string): void;
  reload(): void;
}

/** Preserve destination-owned history state while crossing console apps. */
export function navigateToInboxFollowUp(
  target: InboxWorkspaceFollowUp,
  navigation: InboxFollowUpNavigation,
): void {
  if (isCmsTarget(target.href, navigation.cmsBasePath)) {
    navigation.routerPush(target.href, target.state);
    return;
  }
  navigation.browserPushState(target.state ?? null, "", target.href);
  navigation.reload();
}

function isCmsTarget(href: string, routePath: string): boolean {
  const pathname = new URL(href, "https://brains.invalid").pathname;
  const base = normalizeCmsBasePath(routePath);
  if (base === "") {
    return (
      pathname === "/" ||
      pathname.startsWith("/entities/") ||
      pathname.startsWith("/workspaces/")
    );
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}
