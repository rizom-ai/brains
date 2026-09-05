import { z } from "@brains/utils/zod";

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
