import type {
  ContentVisibility,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { decisionSchema } from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "../constants";
import {
  claimListData,
  registerClaimListWidget,
  type ClaimListData,
  type ClaimReader,
} from "./claim-list";

export type DecisionsWidgetData = ClaimListData;

export async function buildDecisionsWidgetData(
  context: ClaimReader,
  visibilityScope: ContentVisibility,
): Promise<DecisionsWidgetData> {
  return claimListData(
    await context.entityService.listEntities(
      {
        entityType: DECISION_ENTITY_TYPE,
        options: { filter: { visibilityScope } },
      },
      decisionSchema,
    ),
  );
}

export function registerDecisionsWidget(
  runtime: Pick<ServiceRuntime, "dashboardWidget">,
  context: ClaimReader,
): void {
  registerClaimListWidget(runtime, {
    id: "decisions",
    title: "Recent decisions",
    priority: 30,
    empty: "No decisions recorded yet.",
    load: (visibilityScope) =>
      buildDecisionsWidgetData(context, visibilityScope),
  });
}
