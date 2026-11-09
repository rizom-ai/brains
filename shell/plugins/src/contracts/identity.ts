import { z } from "@brains/utils/zod";
import { socialLinkSchema } from "@brains/contracts";

export const BrainCharacterSchema: z.ZodObject<{
  name: z.ZodString;
  role: z.ZodString;
  purpose: z.ZodString;
  values: z.ZodArray<z.ZodString>;
}> = z.object({
  name: z.string(),
  role: z.string(),
  purpose: z.string(),
  values: z.array(z.string()),
});

export type BrainCharacter = z.output<typeof BrainCharacterSchema>;

export const AnchorProfileSchema: z.ZodObject<{
  name: z.ZodString;
  organization: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  avatar: z.ZodOptional<z.ZodString>;
  photo: z.ZodOptional<z.ZodString>;
  website: z.ZodOptional<z.ZodString>;
  email: z.ZodOptional<z.ZodString>;
  socialLinks: z.ZodOptional<z.ZodArray<typeof socialLinkSchema>>;
}> = z.object({
  name: z.string(),
  organization: z.string().optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  photo: z.string().optional(),
  website: z.string().optional(),
  email: z.string().optional(),
  socialLinks: z.array(socialLinkSchema).optional(),
});

export type AnchorProfile = z.output<typeof AnchorProfileSchema>;
