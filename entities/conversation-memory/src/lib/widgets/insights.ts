import type {
  ContentVisibility,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { insightSchema } from "../../schemas/conversation-memory";
import { INSIGHT_ENTITY_TYPE } from "../constants";
import {
  claimListData,
  registerClaimListWidget,
  type ClaimListData,
  type ClaimReader,
} from "./claim-list";

export type InsightsWidgetData = ClaimListData;

export async function buildInsightsWidgetData(
  context: ClaimReader,
  visibilityScope: ContentVisibility,
): Promise<InsightsWidgetData> {
  return claimListData(
    await context.entityService.listEntities(
      {
        entityType: INSIGHT_ENTITY_TYPE,
        options: { filter: { visibilityScope } },
      },
      insightSchema,
    ),
  );
}

export function registerInsightsWidget(
  runtime: Pick<ServiceRuntime, "dashboardWidget">,
  context: ClaimReader,
): void {
  registerClaimListWidget(runtime, {
    id: "insights",
    title: "Recent insights",
    priority: 31,
    empty: "No insights recorded yet.",
    load: (visibilityScope) =>
      buildInsightsWidgetData(context, visibilityScope),
  });
}
