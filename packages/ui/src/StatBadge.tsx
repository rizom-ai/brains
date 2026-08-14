import type { JSX } from "preact";
import { cva } from "class-variance-authority";
import { cn } from "./lib/utils";
import type { VariantFunction, VariantValue } from "./variant-types";

export interface StatBadgeVariantProps {
  variant?: VariantValue<"default" | "muted">;
}

const statBadgeVariants: VariantFunction<StatBadgeVariantProps> = cva(
  "px-2 py-1 rounded-full",
  {
    variants: {
      variant: {
        default: "bg-theme",
        muted: "bg-theme-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface StatBadgeProps extends StatBadgeVariantProps {
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
