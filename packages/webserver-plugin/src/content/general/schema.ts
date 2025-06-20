import { z } from "zod";

export const generalContextSchema = z.object({
  // Core identity
  organizationName: z.string().describe("Name of the organization"),
  tagline: z.string().describe("Short memorable tagline"),
  mission: z.string().describe("Mission statement"),
  vision: z.string().describe("Vision statement"),
  
  // Key values/principles
  values: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).min(3).max(5).describe("Core values"),
  
  // Brand voice/tone
  tone: z.enum(["professional", "casual", "academic", "playful"])
    .describe("Brand voice and tone"),
  
  // Key themes
  themes: z.array(z.string()).min(3).max(6)
    .describe("Key themes and topics"),
  
  // Target audience
  audience: z.object({
    primary: z.string().describe("Primary target audience"),
    secondary: z.string().optional().describe("Secondary audience"),
  }),
  
  // Core offerings/focus areas
  focusAreas: z.array(z.string()).min(3).max(6)
    .describe("Main focus areas or offerings"),
});

export type GeneralContext = z.infer<typeof generalContextSchema>;