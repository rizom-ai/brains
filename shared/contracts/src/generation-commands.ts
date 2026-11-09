import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type GenerateExecuteSchema = z.ZodObject<{ entityType: z.ZodString }>;

export const generateExecuteSchema: GenerateExecuteSchema = z.object({
  entityType: z.string(),
});

/**
 * Content-pipeline's schedule asks for a draft of one entity type. Every
 * type's generator hears it and acts only on its own type.
 */
export const generateExecuteContract: BusContract<
  GenerateExecuteSchema,
  z.ZodVoid,
  "command"
> = defineBusContract({
  channel: "generate:execute",
  request: generateExecuteSchema,
  response: z.void(),
  delivery: "command",
});

type GenerateReportSuccessSchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
}>;

export const generateReportSuccessSchema: GenerateReportSuccessSchema =
  z.object({
    entityType: z.string(),
    entityId: z.string(),
  });

export type GenerateReportSuccessPayload = z.output<
  typeof generateReportSuccessSchema
>;

/** A generator tells content-pipeline it created the draft. */
export const generateReportSuccessContract: BusContract<
  GenerateReportSuccessSchema,
  z.ZodVoid,
  "command"
> = defineBusContract({
  channel: "generate:report:success",
  request: generateReportSuccessSchema,
  response: z.void(),
  delivery: "command",
});

type GenerateReportFailureSchema = z.ZodObject<{
  entityType: z.ZodString;
  error: z.ZodString;
}>;

export const generateReportFailureSchema: GenerateReportFailureSchema =
  z.object({
    entityType: z.string(),
    error: z.string(),
  });

export type GenerateReportFailurePayload = z.output<
  typeof generateReportFailureSchema
>;

/** A generator tells content-pipeline it could not create the draft, and why. */
export const generateReportFailureContract: BusContract<
  GenerateReportFailureSchema,
  z.ZodVoid,
  "command"
> = defineBusContract({
  channel: "generate:report:failure",
  request: generateReportFailureSchema,
  response: z.void(),
  delivery: "command",
});
