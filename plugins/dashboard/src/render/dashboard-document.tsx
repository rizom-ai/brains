/** @jsxImportSource preact */
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_FONTS_URL,
  CONSOLE_PALETTE_SCRIPT,
} from "@brains/console-theme";
import type { JSX } from "preact";
import { Colophon } from "./colophon";
import { ConsoleStrip } from "./console-strip";
import { buildDashboardTabs, TabBar } from "./dashboard-tabs";
import { Masthead } from "./masthead";
import { OverviewPanel } from "./overview-panel";
import { DASHBOARD_STYLES } from "./styles";
import type { DashboardRenderInput } from "./types";
import { DASHBOARD_UI_SCRIPT } from "./ui-script";
import { WidgetTabPanel } from "./widget-tab-panel";

export function DashboardDocument({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  const tabs = buildDashboardTabs(input.widgets);
  const showOperatorGate =
    input.operatorAccess &&
    !input.operatorAccess.isOperator &&
    input.operatorAccess.hiddenWidgetCount > 0;
  const dashboardPath = input.dashboardPath ?? "/dashboard";
  const now = new Date();

  return (
    <html lang="en" data-climate="instrument">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <title>{input.title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={CONSOLE_FONTS_URL} rel="stylesheet" />
        {input.themeCSS !== undefined && (
          <style
            data-dashboard-theme
            dangerouslySetInnerHTML={{ __html: input.themeCSS }}
          />
        )}
        <style
          data-dashboard-styles
          dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }}
        />
        {input.widgetStyles && input.widgetStyles.length > 0 && (
          <style
            data-dashboard-widget-styles
            dangerouslySetInnerHTML={{
              __html: input.widgetStyles.join("\n\n"),
            }}
          />
        )}
      </head>
      <body>
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
          operatorAccess={input.operatorAccess}
        />
        <main class="console" data-component="dashboard:dashboard">
          <div
            class="frame"
            data-ui-tabs
            data-ui-tabs-default="overview"
            data-ui-tabs-hash="true"
          >
            <Masthead title={input.title} tagline={input.profile.description} />
            <TabBar tabs={tabs} />

            <div class="canvas">
              <div class="dashboard-tab-panels">
                <OverviewPanel
                  input={input}
                  tabs={tabs}
                  showOperatorGate={Boolean(showOperatorGate)}
                />
                {tabs.map((tab) => (
                  <WidgetTabPanel
                    key={tab.id}
                    tab={tab}
                    input={input}
                    now={now}
                  />
                ))}
              </div>
            </div>
          </div>

          <Colophon
            title={input.title}
            appInfo={input.appInfo}
            baseUrl={input.baseUrl}
          />
        </main>

        <script dangerouslySetInnerHTML={{ __html: CONSOLE_CLIMATE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: CONSOLE_PALETTE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: DASHBOARD_UI_SCRIPT }} />
        {input.widgetScripts.map((script, index) => (
          <script
            key={`widget-script:${index}`}
            dangerouslySetInnerHTML={{ __html: script }}
          />
        ))}
      </body>
    </html>
  );
}
