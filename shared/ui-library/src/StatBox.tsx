import type { JSX } from "preact";

export interface StatBoxProps {
  title: string;
  count: number;
  className?: string;
}

/**
 * Dashboard-style stat display box with title and count
 */
export const StatBox = ({
  title,
  count,
  className = "",
}: StatBoxProps): JSX.Element => {
  return (
    <div className={`bg-theme p-4 rounded-lg ${className}`}>
      <h3 className="font-semibold text-theme">{title}</h3>
      <p className="text-2xl font-bold text-brand">{count}</p>
    </div>
  );
};
