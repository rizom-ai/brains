import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type ProjectionWaveReadySchema = z.ZodObject<
  {
    waveId: z.ZodString;
    sourceTypes: z.ZodArray<z.ZodString>;
    changedTargetTypes: z.ZodArray<z.ZodString>;
  },
  z.core.$strict
>;

export const ProjectionWaveReadySchema: ProjectionWaveReadySchema =
  z.strictObject({
    waveId: z.string().trim().min(1),
    sourceTypes: z.array(z.string().trim().min(1)),
    changedTargetTypes: z.array(z.string().trim().min(1)),
  });

export type ProjectionWaveReady = z.output<typeof ProjectionWaveReadySchema>;

type ProjectionWaveAckSchema = z.ZodObject<
  Record<string, never>,
  z.core.$strict
>;

/** An acknowledgement carries nothing; it exists or it does not. */
export const projectionWaveAckSchema: ProjectionWaveAckSchema = z.strictObject(
  {},
);

/**
 * A projection wave asks every plugin that reacts to it before the wave
 * completes; the wave completes only when each of them acknowledged.
 */
export const projectionWaveReadyContract: BusContract<
  ProjectionWaveReadySchema,
  ProjectionWaveAckSchema,
  "collect"
> = defineBusContract({
  channel: "projection:wave-ready",
  request: ProjectionWaveReadySchema,
  response: projectionWaveAckSchema,
  delivery: "collect",
});
