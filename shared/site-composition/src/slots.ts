import { defineBusContract, type BusContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { ReactElement } from "react";

/** A pre-bound render function for one slot contribution. */
export type SiteSlotRender = () => ReactElement | null;

type SiteSlotContributionSchema = z.ZodObject<{
  pluginId: z.ZodString;
  slotName: z.ZodString;
  render: z.ZodCustom<SiteSlotRender, SiteSlotRender>;
  priority: z.ZodOptional<z.ZodNumber>;
}>;

export const siteSlotContributionSchema: SiteSlotContributionSchema = z.object({
  pluginId: z.string(),
  slotName: z.string(),
  // A render function cannot be validated beyond being one.
  render: z.custom<SiteSlotRender>((value) => typeof value === "function"),
  priority: z.number().optional(),
});

export type SiteSlotContribution = z.output<typeof siteSlotContributionSchema>;

type SiteBuilderSlotsRequestSchema = z.ZodObject<
  Record<string, never>,
  z.core.$strict
>;

export const siteBuilderSlotsRequestSchema: SiteBuilderSlotsRequestSchema =
  z.strictObject({});

type SiteBuilderSlotsResponseSchema = z.ZodArray<SiteSlotContributionSchema>;

export const siteBuilderSlotsResponseSchema: SiteBuilderSlotsResponseSchema =
  z.array(siteSlotContributionSchema);

/**
 * Collected when a site builds: each plugin answers with its layout slot
 * contributions. Answer in every process (`everyProcess`); builds run in the
 * worker, which never runs the ready phase. Declared here rather than in
 * `@brains/contracts` because a render function is a React element factory.
 */
export const siteBuilderSlotsContract: BusContract<
  SiteBuilderSlotsRequestSchema,
  SiteBuilderSlotsResponseSchema,
  "collect"
> = defineBusContract({
  channel: "plugin:site-builder:slots",
  request: siteBuilderSlotsRequestSchema,
  response: siteBuilderSlotsResponseSchema,
  delivery: "collect",
});
