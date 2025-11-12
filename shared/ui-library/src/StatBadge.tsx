import type { JSX } from "preact";

export interface StatBadgeProps {
  count: number;
  label: string;
  variant?: "default" | "muted";
  className?: string;
}

/**
 * Small pill-style badge for displaying counts/statistics
 */
export const StatBadge = ({
  count,
  label,
  variant = "default",
  className = "",
}: StatBadgeProps): JSX.Element => {
  const variantClasses = {
    default: "px-2 py-1 bg-theme rounded-full",
    muted: "px-2 py-1 bg-theme-muted rounded-full",
  };

  return (
    <span className={`${variantClasses[variant]} ${className}`}>
      {count} {label}
    </span>
  );
};
