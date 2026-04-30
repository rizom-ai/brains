import { z } from "zod";

export const BrainCharacterSchema = z.object({
  name: z.string(),
  role: z.string(),
  purpose: z.string(),
  values: z.array(z.string()),
});

export type BrainCharacter = z.infer<typeof BrainCharacterSchema>;

export const AnchorProfileSchema = z.object({
  name: z.string(),
  kind: z.enum(["professional", "team", "collective"]),
  organization: z.string().optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  website: z.string().optional(),
  email: z.string().optional(),
  socialLinks: z
    .array(
      z.object({
        platform: z.enum([
          "github",
          "instagram",
          "linkedin",
          "email",
          "website",
        ]),
        url: z.string(),
        label: z.string().optional(),
      }),
    )
    .optional(),
});

export type AnchorProfile = z.infer<typeof AnchorProfileSchema>;
