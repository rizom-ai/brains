import {
  defineDashboardWidget,
  type EntityDashboardBindingContext,
  type EntityDashboardWidget,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import {
  swotFrontmatterSchema,
  type swotMetadataSchema,
} from "../schemas/swot";
import { parseSwotContent } from "./swot-content";

const swotWidgetDataSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("generating") }),
  swotFrontmatterSchema.extend({ status: z.literal("ready") }),
]);

/** The brain's SWOT on the Dashboard, or that it is still being derived. */
const swotWidget = defineDashboardWidget({
  id: "swot",
  title: "SWOT",
  group: "network",
  placement: "secondary",
  priority: 14,
  permission: "public",
  data: swotWidgetDataSchema,
  digest: ({ data }) => ({
    items: [
      {
        label: "SWOT",
        value: data.status === "ready" ? "Ready" : "Generating",
        tone: data.status === "ready" ? "good" : "warn",
      },
    ],
  }),
  view: ({ data }) => {
    if (data.status === "generating") {
      return {
        blocks: [
          {
            type: "notice",
            tone: "neutral",
            text: "Generating the current SWOT assessment.",
          },
        ],
      };
    }
    return {
      blocks: [
        {
          type: "matrix",
          id: "swot-matrix",
          columns: 2,
          cells: [
            {
              id: "strengths",
              label: "Strengths",
              tone: "good",
              empty: "No strengths recorded.",
              items: data.strengths.map((item, index) => ({
                id: `strength-${index}`,
                title: item.title,
                ...(item.detail ? { description: item.detail } : {}),
              })),
            },
            {
              id: "weaknesses",
              label: "Weaknesses",
              tone: "warn",
              empty: "No weaknesses recorded.",
              items: data.weaknesses.map((item, index) => ({
                id: `weakness-${index}`,
                title: item.title,
                ...(item.detail ? { description: item.detail } : {}),
              })),
            },
            {
              id: "opportunities",
              label: "Opportunities",
              tone: "good",
              empty: "No opportunities recorded.",
              items: data.opportunities.map((item, index) => ({
                id: `opportunity-${index}`,
                title: item.title,
                ...(item.detail ? { description: item.detail } : {}),
              })),
            },
            {
              id: "threats",
              label: "Threats",
              tone: "error",
              empty: "No threats recorded.",
              items: data.threats.map((item, index) => ({
                id: `threat-${index}`,
                title: item.title,
                ...(item.detail ? { description: item.detail } : {}),
              })),
            },
          ],
        },
      ],
    };
  },
});

/** The brain's SWOT, as the Dashboard shows it to the viewer. */
export function swotWidgetOf(
  context: EntityDashboardBindingContext,
  definition: EntityDefinition<"swot", typeof swotMetadataSchema>,
): EntityDashboardWidget {
  return swotWidget.bind(context, async ({ entities, signal }) => {
    signal.throwIfAborted();
    const stored = await entities.get(definition, "swot");
    signal.throwIfAborted();
    if (!stored) return { status: "generating" as const };
    return {
      status: "ready" as const,
      ...parseSwotContent(stored.content).frontmatter,
    };
  });
}
