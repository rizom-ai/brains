import { z } from "@brains/utils/zod";

export interface NavigationItem {
  label: string;
  href: string;
}

export interface FooterData {
  navigation: NavigationItem[];
  copyright?: string | undefined;
}

const NavigationItemSchema: z.ZodType<NavigationItem> = z.object({
  label: z.string(),
  href: z.string(),
});

export const FooterSchema: z.ZodType<FooterData> = z.object({
  navigation: z.array(NavigationItemSchema),
  copyright: z.string().optional(),
});
