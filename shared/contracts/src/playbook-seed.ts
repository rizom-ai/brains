import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type PlaybookSeedSchema = z.ZodObject<
  { id: z.ZodString; markdown: z.ZodString },
  z.core.$strict
>;

const playbookSeedSchema: PlaybookSeedSchema = z
  .object({
    id: z.string().min(1),
    markdown: z.string().min(1),
  })
  .strict();

type PlaybookSeedResultSchema = z.ZodObject<{ created: z.ZodBoolean }>;

const playbookSeedResultSchema: PlaybookSeedResultSchema = z.object({
  created: z.boolean(),
});

/**
 * A package plants a playbook it bundles, as onboarding plants its guides.
 * The playbook type's steward writes it only where no playbook with that id
 * exists at any visibility, so a seed never overwrites what an owner wrote,
 * and answers whether it created one.
 */
export const playbookSeedContract: BusContract<
  PlaybookSeedSchema,
  PlaybookSeedResultSchema,
  "request"
> = defineBusContract({
  channel: "playbooks:seed",
  request: playbookSeedSchema,
  response: playbookSeedResultSchema,
  delivery: "request",
});

export type PlaybookSeed = z.output<typeof playbookSeedSchema>;
export type PlaybookSeedResult = z.output<typeof playbookSeedResultSchema>;
