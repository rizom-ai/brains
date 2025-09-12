import { z } from "@brains/utils";

const NavigationItemSchema = z.object({
  label: z.string(),
  href: z.string(),
});

export const FooterSchema = z.object({
  navigation: z.array(NavigationItemSchema),
  copyright: z.string().optional(),
});

export type NavigationItem = z.infer<typeof NavigationItemSchema>;
export type FooterData = z.infer<typeof FooterSchema>;
