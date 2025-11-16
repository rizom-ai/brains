import type { JSX } from "preact";

export interface ThemeToggleProps {
  variant?: "default" | "light" | "dark" | "footer";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * ThemeToggle component - a button to toggle between light and dark themes
 * Uses a global toggleTheme() function that should be defined in the page
 */
export function ThemeToggle({
  variant = "default",
  size = "md",
  className = "",
}: ThemeToggleProps): JSX.Element {
  // Variant classes
  const variantClasses = {
    default: "bg-white/20 hover:bg-white/30 text-white", // Semi-transparent for overlays
    light: "bg-theme-subtle hover:bg-theme-muted text-theme",
    dark: "bg-theme-dark hover:bg-theme-muted text-theme-inverse",
    footer:
      "bg-theme-toggle hover:bg-theme-toggle-hover text-theme-toggle-icon", // Footer-specific colors
  };

  // Button padding
  const buttonPadding = {
    sm: "p-1.5",
    md: "p-2",
    lg: "p-3",
  };

  // Icon size
  const iconSize = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const buttonClasses = [
    "rounded-full transition-colors",
    variantClasses[variant],
    buttonPadding[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const iconSizeClass = iconSize[size];

  return (
    <button
      // @ts-expect-error - onclick is valid HTML attribute for SSR
      onclick="toggleTheme()"
      type="button"
      className={buttonClasses}
      aria-label="Toggle dark mode"
    >
      <svg
        className={`${iconSizeClass} transition-colors`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          className="sun-icon"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
        <path
          className="moon-icon"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          transform="rotate(45 12 12)"
        />
      </svg>
    </button>
  );
}
