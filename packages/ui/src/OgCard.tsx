import type { JSX } from "preact";

export interface WordmarkParts {
  primary: string;
  secondary: string | undefined;
}

// Split a brand label into the editorial masthead pattern `<primary>.<secondary>`
// matching the rizom.ai wordmark used by the deck carousel. Prefers an existing
// dot ("rizom.ai"), falls back to first space ("Alex Chen" → "alex.chen"), else
// renders a single part. Shared by every media-render template (no Tailwind in
// that pipeline, so this is intentionally separate from the Rizom Wordmark component).
export function splitWordmark(label: string): WordmarkParts {
  const trimmed = label.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot > 0 && dot < trimmed.length - 1) {
    return {
      primary: trimmed.slice(0, dot).toLowerCase(),
      secondary: trimmed.slice(dot + 1).toLowerCase(),
    };
  }
  const space = trimmed.indexOf(" ");
  if (space > 0) {
    return {
      primary: trimmed.slice(0, space).toLowerCase(),
      secondary: trimmed.slice(space + 1).toLowerCase(),
    };
  }
  return { primary: trimmed.toLowerCase(), secondary: undefined };
}

export interface OgCardProps {
  /** Brand label rendered as the masthead wordmark, e.g. "rizom.ai". */
  brandLabel: string;
  /** Entity-type kicker above the title, e.g. "Journal", "Project". */
  eyebrow: string;
  title: string;
  subtitle?: string | undefined;
  /** Muted footer items (author, event, …), rendered left and dot-separated. */
  meta?: readonly (string | undefined)[] | undefined;
  /** Accent footer highlight on the right (date, year, availability, …). */
  tag?: string | number | undefined;
  /** Use the larger "cover" treatment for short hero titles (product names). */
  cover?: boolean | undefined;
}

/**
 * 1200×630 Open Graph card shared by every entity's `og-image` template.
 * Mirrors the dark-theme design language of the deck carousel
 * (entities/decks/src/attachments/carousel-template.tsx): masthead wordmark,
 * Fraunces title, IBM Plex Sans subtitle, JetBrains Mono meta footer. Styling
 * ships inline because these render in a standalone headless page, not the
 * Tailwind site pipeline.
 */
export function OgCard({
  brandLabel,
  eyebrow,
  title,
  subtitle,
  meta,
  tag,
  cover,
}: OgCardProps): JSX.Element {
  const { primary, secondary } = splitWordmark(brandLabel);
  const metaItems = (meta ?? []).filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );

  return (
    <main className={cover ? "og-card is-cover" : "og-card"} aria-label={title}>
      <style dangerouslySetInnerHTML={{ __html: OG_CARD_CSS }} />
      <header className="og-header">
        <span className="og-wordmark" aria-label={brandLabel}>
          <span className="wm-primary">{primary}</span>
          {secondary !== undefined && (
            <>
              <span className="wm-dot">.</span>
              <span className="wm-secondary">{secondary}</span>
            </>
          )}
        </span>
      </header>
      <div className="og-body">
        <p className="og-eyebrow">{eyebrow}</p>
        <h1 className="og-title">{title}</h1>
        {subtitle && <p className="og-subtitle">{subtitle}</p>}
      </div>
      <footer className="og-footer">
        <div className="og-meta">
          {metaItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        {tag !== undefined && tag !== "" && (
          <span className="og-tag">{tag}</span>
        )}
      </footer>
    </main>
  );
}

export const OG_CARD_CSS = `
  @import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,400&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap");
  @page { size: 1200px 630px; margin: 0; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0c0c10; }

  .og-card {
    --surface: #0c0c10;
    --surface-deep: #050507;
    --surface-glow: #1a1530;
    --ink: #f0ede5;
    --heading: #f7f3e6;
    --ink-muted: color-mix(in srgb, var(--ink) 50%, var(--surface));
    --divider: color-mix(in srgb, var(--ink) 12%, var(--surface));
    --accent: var(--color-accent, var(--color-brand, #ff8b3d));
    --accent-soft: color-mix(in srgb, var(--accent) 22%, var(--surface));
    --glow-soft: color-mix(in srgb, var(--surface-glow) 55%, var(--surface));
    --font-heading: var(--font-heading, "Fraunces", "IBM Plex Sans", serif);
    --font-sans: var(--font-sans, "IBM Plex Sans", -apple-system, system-ui, sans-serif);
    --font-mono: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);

    box-sizing: border-box;
    position: relative;
    width: 1200px;
    height: 630px;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto 1fr auto;
    padding: 60px 72px;
    color: var(--ink);
    font-family: var(--font-sans);
    font-weight: 400;
    background-color: var(--surface);
    background-image: linear-gradient(
      165deg,
      var(--surface) 0%,
      var(--accent-soft) 26%,
      var(--glow-soft) 62%,
      var(--surface-deep) 100%
    );
  }
  .og-card.is-cover {
    background-color: var(--surface-deep);
    background-image: linear-gradient(
      155deg,
      var(--accent-soft) 0%,
      var(--surface-deep) 34%,
      var(--surface) 68%,
      var(--glow-soft) 100%
    );
  }

  .og-header { display: flex; align-items: center; }
  .og-wordmark {
    display: inline-flex;
    align-items: baseline;
    font-family: var(--font-heading);
    font-weight: 500;
    font-size: 40px;
    letter-spacing: -0.02em;
    line-height: 1;
    font-variation-settings: "opsz" 24;
  }
  .og-wordmark .wm-primary { color: var(--heading); }
  .og-wordmark .wm-dot { color: var(--accent); }
  .og-wordmark .wm-secondary { color: var(--ink-muted); font-style: italic; font-weight: 400; }

  .og-body { display: flex; min-width: 0; flex-direction: column; justify-content: center; padding: 32px 0; }
  .og-eyebrow {
    margin: 0 0 26px;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 19px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .og-title {
    margin: 0;
    max-width: 960px;
    color: var(--heading);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 76px;
    line-height: 0.98;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }
  .og-card.is-cover .og-title {
    font-size: 104px;
    line-height: 0.94;
    letter-spacing: -0.035em;
    max-width: 820px;
  }
  .og-title em { font-style: italic; color: var(--accent); }
  .og-subtitle {
    margin: 30px 0 0;
    max-width: 800px;
    color: var(--ink);
    font-weight: 400;
    font-size: 30px;
    line-height: 1.3;
    text-wrap: balance;
  }

  .og-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    border-top: 1px solid var(--divider);
  }
  .og-meta {
    display: flex;
    align-items: center;
    gap: 18px;
    font-family: var(--font-mono);
    font-size: 22px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .og-meta span + span { position: relative; padding-left: 18px; }
  .og-meta span + span::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--ink-muted);
  }
  .og-tag {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 22px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
`;
