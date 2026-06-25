import { z } from "@brains/utils/zod-v4";

const NavigationItemSchema = z.object({
  label: z.string(),
  href: z.string(),
});

export const FooterSchema = z.object({
  navigation: z.array(NavigationItemSchema),
  copyright: z.string().optional(),
});

export type NavigationItem = z.output<typeof NavigationItemSchema>;
export type FooterData = z.output<typeof FooterSchema>;
