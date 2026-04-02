import type { JSX } from "preact";

/**
 * Extract hostname from a URL for display purposes.
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Avatar circle with deterministic color derived from name.
 */
export const AgentAvatar = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}): JSX.Element => {
  const initial = name.charAt(0).toUpperCase();

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;

  return (
    <div
      className={`flex items-center justify-center rounded-full text-white font-bold flex-shrink-0 ${className}`}
      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
    >
      {initial}
    </div>
  );
};

/**
 * Kind badge with semantic coloring.
 * Size variants: "sm" for list views, "md" for detail views.
 */
export const KindBadge = ({
  kind,
  size = "md",
}: {
  kind: string;
  size?: "sm" | "md";
}): JSX.Element => {
  const colorMap: Record<string, string> = {
    professional: "bg-status-success text-status-success",
    team: "bg-status-info text-status-info",
    collective: "bg-brand/10 text-brand",
  };
  const classes = colorMap[kind] ?? "bg-status-neutral text-status-neutral";
  const sizeClasses =
    size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-0.5 text-[13px]";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${classes}`}
    >
      {kind}
    </span>
  );
};
