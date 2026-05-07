import type { JSX } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const themeToggleVariants = cva(
  "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "rounded-[10px] bg-theme-subtle border border-theme text-theme-muted hover:text-accent hover:border-brand/40",
        light:
          "rounded-[10px] bg-theme-subtle border border-theme text-theme-muted hover:text-accent",
        dark: "rounded-[10px] bg-theme-dark hover:bg-theme-muted text-theme-inverse",
        footer:
          "rounded-full bg-theme-toggle hover:bg-theme-toggle-hover text-theme-toggle-icon",
      },
      size: {
        sm: "p-1.5",
        md: "p-2",
        lg: "p-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

const iconSizeMap = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
} as const;

export interface ThemeToggleProps extends VariantProps<
  typeof themeToggleVariants
> {
  className?: string;
}

/**
 * ThemeToggle component - a button to toggle between light and dark themes
 * Uses a global toggleTheme() function that should be defined in the page
 */
export function ThemeToggle({
  variant,
  size,
  className,
}: ThemeToggleProps): JSX.Element {
  const iconSizeClass = iconSizeMap[size ?? "md"];

  return (
    <button
      // @ts-expect-error - onclick is valid HTML attribute for SSR
      onclick="toggleTheme()"
      type="button"
      className={cn(themeToggleVariants({ variant, size }), className)}
      aria-label="Toggle dark mode"
    >
      <svg
        className={cn(iconSizeClass, "transition-colors")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          className="sun-icon"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
        <path
          className="moon-icon"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.354 15.354A9 9 0 018.646 3.646 9 9 0 1020.354 15.354z"
        />
      </svg>
    </button>
  );
}

export { themeToggleVariants };
