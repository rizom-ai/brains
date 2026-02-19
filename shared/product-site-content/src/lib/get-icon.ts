import * as LucideIcons from "lucide-preact";
import type { LucideIcon } from "lucide-preact";

const icons = LucideIcons as unknown as Record<string, LucideIcon>;

/**
 * Look up a Lucide icon component by name, with HelpCircle as fallback
 */
export const getIcon = (iconName: string): LucideIcon =>
  icons[iconName] ?? LucideIcons.HelpCircle;
