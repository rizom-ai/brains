import type { JSX } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
  {
    variants: {
      status: {
        // Newsletter/content statuses
        draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
        queued: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
        sent: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
        failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
        // Social media statuses
        published:
          "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
        // Link statuses
        pending:
          "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200",
        captured:
          "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
        // Product statuses
        available:
          "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
        "early access":
          "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
        "coming soon":
          "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200",
        planned:
          "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
      },
    },
    defaultVariants: {
      status: "draft",
    },
  },
);

export interface StatusBadgeProps
  extends VariantProps<typeof statusBadgeVariants> {
  className?: string;
  /** Override the displayed text (defaults to status value) */
  label?: string;
}

/**
 * Status badge component for displaying status labels with color coding
 */
export const StatusBadge = ({
  status,
  className,
  label,
}: StatusBadgeProps): JSX.Element => {
  return (
    <span className={cn(statusBadgeVariants({ status }), className)}>
      {label ?? status}
    </span>
  );
};

export { statusBadgeVariants };
