import { defineDashboardWidget, z } from "@brains/sdk/entities";
import type { DashboardWidgetDefinition } from "@brains/sdk/entities";
import { swotFrontmatterSchema } from "../schemas/swot";

type SwotWidgetDataSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ status: z.ZodLiteral<"generating"> }>,
    ReturnType<
      typeof swotFrontmatterSchema.extend<{
        status: z.ZodLiteral<"ready">;
      }>
    >,
  ],
  "status"
>;

const swotWidgetDataSchema: SwotWidgetDataSchema = z.discriminatedUnion(
  "status",
  [
    z.object({ status: z.literal("generating") }),
    swotFrontmatterSchema.extend({ status: z.literal("ready") }),
  ],
);

export const swotWidget: DashboardWidgetDefinition<
  "swot",
  SwotWidgetDataSchema
> = defineDashboardWidget({
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
