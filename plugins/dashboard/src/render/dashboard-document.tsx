/** @jsxImportSource react */
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_FONTS_URL,
  CONSOLE_PALETTE_SCRIPT,
} from "@brains/console-theme";
import type { JSX } from "react";
import { Colophon } from "./colophon";
import { ConsoleStrip } from "./console-strip";
import { TabBar } from "./dashboard-tabs";
import { KnowledgeMapPanel } from "./knowledge-map";
import { Masthead } from "./masthead";
import { OverviewPanel } from "./overview-panel";
import { ProximityMapPanel } from "./proximity-map";
import {
  findCartesianMap,
  findRadialMap,
  findRenderableWidget,
} from "./public-card-data";
import { DASHBOARD_STYLES } from "./styles";
import type { DashboardRenderInput } from "./types";
import { DASHBOARD_UI_SCRIPT } from "./ui-script";

export function DashboardDocument({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  const knowledgeMap = findCartesianMap(input.widgets);
  const proximityMap = findRadialMap(input.widgets);
  const proximityWidget = findRenderableWidget(
    input.widgets,
    "agent-discovery",
    "agent-proximity",
  );
  const dashboardPath = input.dashboardPath ?? "/dashboard";
  const operatorHref = input.surfaces?.find(
    (surface) => surface.id === "studio",
  )?.href;

  return (
    <html lang="en" data-climate="instrument" data-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <title>{input.title}</title>
        <script dangerouslySetInnerHTML={{ __html: CONSOLE_CLIMATE_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={CONSOLE_FONTS_URL} rel="stylesheet" />
        {input.assetUrls?.themeStyles ? (
          <link
            data-dashboard-theme
            rel="stylesheet"
            href={input.assetUrls.themeStyles}
          />
        ) : (
          input.themeCSS !== undefined && (
            <style
              data-dashboard-theme
              dangerouslySetInnerHTML={{ __html: input.themeCSS }}
            />
          )
        )}
        {input.assetUrls ? (
          <link
            data-dashboard-styles
            rel="stylesheet"
            href={input.assetUrls.dashboardStyles}
          />
        ) : (
          <style
            data-dashboard-styles
            dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }}
          />
        )}
        {input.widgetStyles && input.widgetStyles.length > 0 && (
          <style
            data-dashboard-widget-styles
            dangerouslySetInnerHTML={{
              __html: input.widgetStyles.join("\n\n"),
            }}
          />
        )}
      </head>
      <body data-auth-role={input.authAccess?.principal?.role}>
        <ConsoleStrip
          dashboardPath={dashboardPath}
          surfaces={
            input.surfaces ?? [
              {
                id: "dashboard",
                label: "Dashboard",
                href: dashboardPath,
                isActive: true,
              },
            ]
          }
          authAccess={input.authAccess}
        />
        <main className="console" data-component="dashboard:dashboard">
          <div
            className="frame"
            data-ui-tabs
            data-ui-tabs-default="overview"
            data-ui-tabs-hash="true"
          >
            <Masthead title={input.title} tagline={input.profile.description} />
            <TabBar
              knowledgeCount={input.appInfo.entities}
              networkCount={
                proximityMap?.points.filter(
                  (point) => point.status !== "archived",
                ).length ?? 0
              }
            />

            <div className="canvas">
              <div className="dashboard-tab-panels">
                <OverviewPanel input={input} />
                <KnowledgeMapPanel
                  block={knowledgeMap}
                  entityTotal={input.appInfo.entities}
                />
                <ProximityMapPanel
                  block={proximityMap}
                  widget={proximityWidget}
                />
              </div>
              <Colophon
                title={input.title}
                appInfo={input.appInfo}
                baseUrl={input.baseUrl}
                operatorHref={operatorHref}
              />
            </div>
          </div>
        </main>

        {input.assetUrls ? (
          <script data-dashboard-script src={input.assetUrls.dashboardScript} />
        ) : (
          <>
            <script
              dangerouslySetInnerHTML={{ __html: CONSOLE_PALETTE_SCRIPT }}
            />
            <script dangerouslySetInnerHTML={{ __html: DASHBOARD_UI_SCRIPT }} />
          </>
        )}
        {(input.widgetScripts ?? []).map((script, index) => (
          <script
            key={`widget-script:${index}`}
            data-dashboard-widget-script
            dangerouslySetInnerHTML={{ __html: script }}
          />
        ))}
      </body>
    </html>
  );
}
