import type { JSX } from "preact";
import { cva } from "class-variance-authority";
import { cn } from "./lib/utils";
import type { VariantFunction, VariantValue } from "./variant-types";

export type StatusBadgeStatus =
  | "draft"
  | "generating"
  | "queued"
  | "sent"
  | "failed"
  | "published"
  | "pending"
  | "captured"
  | "available"
  | "early access"
  | "coming soon"
  | "planned";

export interface StatusBadgeVariantProps {
  status?: VariantValue<StatusBadgeStatus>;
}

const statusBadgeVariants: VariantFunction<StatusBadgeVariantProps> = cva(
  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
  {
    variants: {
      status: {
        // Newsletter/content statuses
        draft: "bg-status-neutral text-status-neutral",
        generating: "bg-status-warning text-status-warning",
        queued: "bg-status-info text-status-info",
        sent: "bg-status-success text-status-success",
        failed: "bg-status-danger text-status-danger",
        // Social media statuses
        published: "bg-status-success text-status-success",
        // Link statuses
        pending: "bg-status-warning text-status-warning",
        captured: "bg-status-info text-status-info",
        // Product statuses
        available: "bg-status-success text-status-success",
        "early access": "bg-status-info text-status-info",
        "coming soon": "bg-status-warning text-status-warning",
        planned: "bg-status-neutral text-status-neutral",
      },
    },
    defaultVariants: {
      status: "draft",
    },
  },
);

export interface StatusBadgeProps extends StatusBadgeVariantProps {
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
