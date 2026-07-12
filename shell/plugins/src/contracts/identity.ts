import { z } from "@brains/utils/zod";

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
  kind: z.ZodEnum<{
    professional: "professional";
    team: "team";
    collective: "collective";
  }>;
  organization: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  avatar: z.ZodOptional<z.ZodString>;
  website: z.ZodOptional<z.ZodString>;
  email: z.ZodOptional<z.ZodString>;
  socialLinks: z.ZodOptional<
    z.ZodArray<
      z.ZodObject<{
        platform: z.ZodEnum<{
          github: "github";
          instagram: "instagram";
          linkedin: "linkedin";
          email: "email";
          website: "website";
        }>;
        url: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
      }>
    >
  >;
}> = z.object({
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

export type AnchorProfile = z.output<typeof AnchorProfileSchema>;
