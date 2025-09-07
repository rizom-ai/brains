import { z } from "@brains/utils";

export const FooterSchema = z.object({
  navigation: z.array(
    z.object({
      label: z.string(),
      href: z.string(),
    }),
  ),
  copyright: z.string().optional(),
});

export type FooterData = z.infer<typeof FooterSchema>;
