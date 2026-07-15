import type { JSX } from "preact";
import type { AgentStatus } from "../schemas/agent";

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
 * Frontmatter fields needed to classify and label an agent's status.
 */
export interface StatusFrontmatter {
  status: AgentStatus;
  introducedBy?: string[] | undefined;
}

/**
 * A sighted agent is a discovered agent with provenance — it was seen in a
 * connected peer's public directory rather than saved first-hand.
 */
export function isSightedAgent(frontmatter: StatusFrontmatter): boolean {
  return (
    frontmatter.status === "discovered" &&
    (frontmatter.introducedBy?.length ?? 0) > 0
  );
}

/**
 * Deterministic hue derived from a name, for per-agent color identity.
 */
export function nameHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/**
 * Ghosted display-serif initial used as a card watermark. Carries the
 * agent's deterministic hue without an avatar box. The parent needs
 * relative positioning and overflow-hidden.
 */
export const GhostGlyph = ({ name }: { name: string }): JSX.Element => (
  <span
    aria-hidden="true"
    className="absolute -top-7 -right-1.5 font-heading font-semibold text-[130px] leading-none pointer-events-none select-none"
    style={{ color: `hsl(${nameHue(name)} 55% 50% / 0.10)` }}
  >
    {name.charAt(0).toUpperCase()}
  </span>
);

/**
 * Dot-plus-word status marker: colored dot and a lowercase label that
 * the mono/uppercase styling turns into a small cap line.
 */
export const DotStatus = ({
  frontmatter,
}: {
  frontmatter: StatusFrontmatter;
}): JSX.Element => {
  const [label, color] =
    frontmatter.status === "approved"
      ? ["connected", "text-status-success"]
      : frontmatter.status === "archived"
        ? ["archived", "text-theme-muted"]
        : isSightedAgent(frontmatter)
          ? ["sighted", "text-status-warning"]
          : ["awaiting approval", "text-status-warning"];

  return (
    <span
      className={`ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] whitespace-nowrap ${color}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};

/**
 * Mono uppercase section heading with a hairline rule filling the rest
 * of the row and an optional count/hint.
 */
export const RuledHeading = ({
  title,
  count,
  hint,
}: {
  title: string;
  count?: number;
  hint?: string;
}): JSX.Element => (
  <div className="flex items-center gap-3.5 mb-5">
    <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-heading whitespace-nowrap mb-0">
      {title}
    </h2>
    {count !== undefined && (
      <span className="font-mono text-xs text-brand">{count}</span>
    )}
    <span className="flex-1 border-t border-theme opacity-60" />
    {hint && (
      <span className="text-[13px] text-theme-muted whitespace-nowrap hidden sm:inline">
        {hint}
      </span>
    )}
  </div>
);

/**
 * Dot-grid backdrop fading out from the top left, behind hero sections.
 * The parent needs relative positioning.
 */
export const DotPattern = (): JSX.Element => (
  <div
    aria-hidden="true"
    className="absolute -inset-x-20 -top-10 bottom-0 pointer-events-none"
    style={{
      backgroundImage:
        "radial-gradient(var(--color-pattern-dot) 1px, transparent 1px)",
      backgroundSize: "22px 22px",
      WebkitMaskImage:
        "radial-gradient(ellipse 70% 100% at 30% 0%, black 30%, transparent 75%)",
      maskImage:
        "radial-gradient(ellipse 70% 100% at 30% 0%, black 30%, transparent 75%)",
    }}
  />
);
