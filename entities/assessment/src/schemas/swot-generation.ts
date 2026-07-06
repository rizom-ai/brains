import { z } from "@brains/utils/zod";

export interface SwotDerivationJobData {
  reason: string;
}

export interface SwotDerivationJobDataInput {
  reason?: string | undefined;
}

export const swotDerivationJobSchema: z.ZodType<
  SwotDerivationJobData,
  SwotDerivationJobDataInput
> = z.object({
  reason: z.string().default("entity-change"),
});

export interface SwotDraftGenerationItem {
  theme: string;
  evidence: string;
  action: string;
}

export const swotDraftGenerationItemSchema: z.ZodType<
  SwotDraftGenerationItem,
  SwotDraftGenerationItem
> = z.object({
  theme: z.string(),
  evidence: z.string(),
  action: z.string(),
});

export interface SwotDraftGeneration {
  strengths: SwotDraftGenerationItem[];
  weaknesses: SwotDraftGenerationItem[];
  opportunities: SwotDraftGenerationItem[];
  threats: SwotDraftGenerationItem[];
}

export const swotDraftGenerationSchema: z.ZodType<
  SwotDraftGeneration,
  SwotDraftGeneration
> = z.object({
  strengths: z.array(swotDraftGenerationItemSchema),
  weaknesses: z.array(swotDraftGenerationItemSchema),
  opportunities: z.array(swotDraftGenerationItemSchema),
  threats: z.array(swotDraftGenerationItemSchema),
});

export interface SwotGenerationItem {
  sourceTheme: string;
  title: string;
  detail: string | null;
}

export const swotGenerationItemSchema: z.ZodType<
  SwotGenerationItem,
  SwotGenerationItem
> = z.object({
  sourceTheme: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
});

export interface SwotGeneration {
  strengths: SwotGenerationItem[];
  weaknesses: SwotGenerationItem[];
  opportunities: SwotGenerationItem[];
  threats: SwotGenerationItem[];
}

export const swotGenerationSchema: z.ZodType<SwotGeneration, SwotGeneration> =
  z.object({
    strengths: z.array(swotGenerationItemSchema),
    weaknesses: z.array(swotGenerationItemSchema),
    opportunities: z.array(swotGenerationItemSchema),
    threats: z.array(swotGenerationItemSchema),
  });
