import type { JSX } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const statBadgeVariants = cva("px-2 py-1 rounded-full", {
  variants: {
    variant: {
      default: "bg-theme",
      muted: "bg-theme-muted",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface StatBadgeProps extends VariantProps<typeof statBadgeVariants> {
  count: number;
  label: string;
  className?: string;
}

/**
 * Small pill-style badge for displaying counts/statistics
 */
export const StatBadge = ({
  count,
  label,
  variant,
  className,
}: StatBadgeProps): JSX.Element => {
  return (
    <span className={cn(statBadgeVariants({ variant }), className)}>
      {count} {label}
    </span>
  );
};

export { statBadgeVariants };
