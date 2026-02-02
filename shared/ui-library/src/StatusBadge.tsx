import type { JSX } from "preact";

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusColors: Record<string, string> = {
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
  captured: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  // Product statuses
  live: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
  beta: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  alpha:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200",
  concept: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
};

/**
 * Status badge component for displaying status labels with color coding
 */
export const StatusBadge = ({
  status,
  className = "",
}: StatusBadgeProps): JSX.Element => {
  const colorClass = statusColors[status] ?? statusColors["draft"];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}
    >
      {status}
    </span>
  );
};
