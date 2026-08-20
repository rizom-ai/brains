/** @jsxImportSource react */
import {
  renderConsoleStripInnerHtml,
  type ConsoleStripSession,
  type ConsoleSurface,
} from "@brains/console-theme";
import type { JSX } from "react";
import type { DashboardRenderInput } from "./types";

/**
 * The console strip, rendered from the shared HTML implementation in
 * `@brains/console-theme` — the same markup the server-rendered shells
 * (web-chat, CMS editor, admin, account) interpolate, so the chrome cannot
 * drift between surfaces. The strip is static chrome (its toggles are wired
 * by the console scripts), so injecting markup carries no behavior.
 */
export function ConsoleStrip({
  dashboardPath,
  surfaces,
  authAccess,
}: {
  dashboardPath: string;
  surfaces: ConsoleSurface[];
  authAccess: DashboardRenderInput["authAccess"];
}): JSX.Element {
  const principal = authAccess?.principal;
  const session: ConsoleStripSession = principal
    ? {
        kind: "authenticated",
        sessionHref: authAccess.logoutUrl,
        principal: {
          displayName: principal.displayName,
          role: principal.role,
        },
      }
    : { kind: "visitor", loginHref: authAccess?.loginUrl ?? "/login" };

  return (
    <header
      className="console-strip"
      aria-label="Console surfaces"
      dangerouslySetInnerHTML={{
        __html: renderConsoleStripInnerHtml({
          surfaces,
          session,
          homeHref: dashboardPath,
        }),
      }}
    />
  );
}
