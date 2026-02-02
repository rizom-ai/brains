import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines clsx and tailwind-merge for conditional class composition
 * with automatic Tailwind class deduplication.
 *
 * @example
 * cn("px-2 py-1", isActive && "bg-brand", className)
 * cn("text-sm", { "font-bold": isBold })
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
