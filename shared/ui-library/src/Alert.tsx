import type { JSX, ComponentChildren } from "preact";
import { cva } from "class-variance-authority";
import { cn } from "./lib/utils";
import type { VariantFunction, VariantValue } from "./variant-types";

export interface AlertVariantProps {
  variant?: VariantValue<"warning" | "error" | "success" | "info">;
}

const alertVariants: VariantFunction<AlertVariantProps> = cva(
  "p-4 rounded-lg border",
  {
    variants: {
      variant: {
        warning: "bg-warning border-warning text-warning",
        error: "bg-error border-error text-error",
        success: "bg-success border-success text-success",
        info: "bg-info border-info text-info",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export interface AlertProps extends AlertVariantProps {
  title?: string;
  children: ComponentChildren;
  className?: string;
}

/**
 * Alert component for displaying notifications, warnings, and status messages.
 *
 * @example
 * ```tsx
 * <Alert variant="warning" title="Pending Review">
 *   This item needs additional information.
 * </Alert>
 * ```
 */
export function Alert({
  variant,
  title,
  children,
  className,
}: AlertProps): JSX.Element {
  return (
    <div className={cn(alertVariants({ variant }), className)} role="alert">
      {title && <p className="font-medium text-current opacity-90">{title}</p>}
      <div className={cn(title && "mt-1", "text-sm text-current opacity-75")}>
        {children}
      </div>
    </div>
  );
}

export { alertVariants };
