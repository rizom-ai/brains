import {
  sdkErrorFrom,
  type BusContract,
  type BusResult,
} from "@brains/contracts";
import type { z } from "@brains/utils/zod";
import {
  dashboardWidgetRegisterContract,
  dashboardWidgetUnregisterContract,
  type DashboardWidgetRegistration,
} from "../contracts/dashboard-widget-contracts";
import {
  studioOverviewContributionRegisterContract,
  studioOverviewContributionUnregisterContract,
} from "../contracts/studio-overview-contracts";
import type { IMessagingNamespace } from "./context-types";

export {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardDigestLine,
  type DashboardWidgetProviderContext,
  type DashboardWidgetRegistration,
  type DashboardWidgetRenderer,
} from "../contracts/dashboard-widget-contracts";
export type {
  StudioOverviewContributionRegistration,
  StudioOverviewContributionUnregistration,
} from "../contracts/studio-overview-contracts";

/** Semantic widget contribution routed by declared visibility. */
export interface IDashboardNamespace {
  /** Whether Dashboard or Studio Overview can host a widget. */
  isAvailable(): boolean;
  /** Contribute a widget. Returns false when no eligible host is mounted. */
  registerWidget: (widget: DashboardWidgetRegistration) => Promise<boolean>;
  /** Withdraw widgets. Returns false when no eligible host is mounted. */
  unregisterWidget: (widgetId?: string) => Promise<boolean>;
}

/** Whether a host took the call: `unavailable` means it is not mounted. */
function hosted(
  operation: "register" | "unregister",
  result: BusResult<void>,
): boolean {
  if (result.status === "failed") {
    throw sdkErrorFrom(
      result.error,
      `Dashboard widget ${operation} failed: ${result.error.message}`,
    );
  }
  return result.status === "answered";
}

export function createDashboardNamespace(
  messaging: IMessagingNamespace,
  pluginId: string,
  hasHandler: (channel: string) => boolean,
): IDashboardNamespace {
  /**
   * A host that is not mounted is not asked, so a widget meets a host's own
   * limits only where that host runs.
   */
  const ask = async <TRequest extends z.ZodType>(
    contract: BusContract<TRequest, z.ZodVoid, "request">,
    payload: z.input<TRequest>,
  ): Promise<BusResult<void>> =>
    hasHandler(contract.name)
      ? messaging.request(contract, payload)
      : { status: "unavailable" };
  return {
    isAvailable: (): boolean =>
      hasHandler(dashboardWidgetRegisterContract.name) ||
      hasHandler(studioOverviewContributionRegisterContract.name),
    registerWidget: async (widget): Promise<boolean> => {
      const onDashboard = hosted(
        "register",
        await ask(dashboardWidgetRegisterContract, {
          ...widget,
          pluginId,
        }),
      );

      const visibility = widget.visibility ?? "public";
      if (visibility === "public") return onDashboard;
      const inOverview = hosted(
        "register",
        await ask(studioOverviewContributionRegisterContract, {
          ...widget,
          pluginId,
          visibility,
        }),
      );
      return onDashboard || inOverview;
    },
    unregisterWidget: async (widgetId): Promise<boolean> => {
      const fromDashboard = hosted(
        "unregister",
        await ask(dashboardWidgetUnregisterContract, {
          pluginId,
          ...(widgetId ? { widgetId } : {}),
        }),
      );
      const fromOverview = hosted(
        "unregister",
        await ask(studioOverviewContributionUnregisterContract, {
          pluginId,
          ...(widgetId ? { contributionId: widgetId } : {}),
        }),
      );
      return fromDashboard || fromOverview;
    },
  };
}
