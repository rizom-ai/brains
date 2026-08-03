import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

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

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
