import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type SiteHeadScriptsRequestSchema = z.ZodObject<
  Record<string, never>,
  z.core.$strict
>;

export const siteHeadScriptsRequestSchema: SiteHeadScriptsRequestSchema =
  z.strictObject({});

/** One script string for every page's head. */
export const siteHeadScriptResponseSchema: z.ZodString = z.string();

/**
 * Collected when a site builds: each plugin answers with one script for
 * every page's head. Answer in every process (`everyProcess`); builds run in
 * the worker, which never runs the ready phase.
 */
export const siteHeadScriptsContract: BusContract<
  SiteHeadScriptsRequestSchema,
  z.ZodString,
  "collect"
> = defineBusContract({
  channel: "plugin:site-builder:head-scripts",
  request: siteHeadScriptsRequestSchema,
  response: siteHeadScriptResponseSchema,
  delivery: "collect",
});
