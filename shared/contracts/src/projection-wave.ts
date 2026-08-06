import { z } from "@brains/utils/zod";

export interface ProjectionWaveReady {
  waveId: string;
  sourceTypes: string[];
  changedTargetTypes: string[];
}

export const ProjectionWaveReadySchema: z.ZodType<ProjectionWaveReady> =
  z.strictObject({
    waveId: z.string().trim().min(1),
    sourceTypes: z.array(z.string().trim().min(1)),
    changedTargetTypes: z.array(z.string().trim().min(1)),
  });
