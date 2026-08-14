import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Brain-aware tailwind-merge instance.
 *
 * The default `twMerge` only knows about Tailwind's built-in font-size
 * scale (`text-xs`, `text-sm`, ..., `text-9xl`). Brain themes extend
 * the scale with their own semantic tokens (`text-display-2xl`,
 * `text-heading-md`, `text-body-sm`, `text-label-xs`, etc.) which
 * twMerge doesn't recognize. Without this extension, a class string
 * like `"text-accent text-label-md"` gets collapsed because both
 * classes start with `text-` and twMerge defaults to treating the
 * second one as a color, silently dropping `text-accent`.
 *
 * Listing the brand scale here teaches twMerge that `text-{name}` for
 * these names belongs to the `font-size` group, not the color group,
 * so color + size on the same element coexist correctly.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-2xl",
            "display-xl",
            "display-lg",
            "display-md",
            "display-sm",
            "heading-lg",
            "heading-md",
            "heading-sm",
            "body-xl",
            "body-lg",
            "body-md",
            "body-sm",
            "body-xs",
            "label-md",
            "label-sm",
            "label-xs",
          ],
        },
      ],
    },
  },
});

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
