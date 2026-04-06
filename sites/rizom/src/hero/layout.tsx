import type { JSX } from "preact";
import type { HeroContent } from "./schema";

/**
 * Hero section for rizom sites.
 *
 * Matches the structure in docs/design/rizom-ai.html:
 *   - eyebrow badge
 *   - large display headline
 *   - subhead
 *   - primary + secondary CTA row
 *
 * All copy is content-driven with variant-appropriate defaults so the
 * same component renders for ai / foundation / work without changes.
 */
export const HeroLayout = ({
  eyebrow = "BUILD THE AGENT THAT REPRESENTS YOU",
  headline = "Your knowledge, your agent, your rules.",
  subhead = "An open-source brain framework for people who refuse to rent their own context. Capture, synthesize, and publish knowledge on infrastructure you own.",
  primaryCtaLabel = "Get started",
  primaryCtaHref = "#quickstart",
  secondaryCtaLabel = "See how it works",
  secondaryCtaHref = "#answer",
}: HeroContent): JSX.Element => {
  return (
    <section
      id="hero"
      className="hero relative min-h-screen flex items-center overflow-hidden"
    >
      <div className="relative z-10 w-full max-w-layout mx-auto px-6 md:px-20 py-32">
        <div className="max-w-3xl">
          {eyebrow && (
            <div
              className="text-xs uppercase tracking-[0.15em] font-mono text-accent mb-6"
              style={{ fontFamily: "var(--font-label)" }}
            >
              {eyebrow}
            </div>
          )}
          <h1
            className="text-5xl md:text-7xl leading-[1.05] tracking-tight mb-6 text-text"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            {headline}
          </h1>
          <p
            className="text-lg md:text-xl leading-relaxed text-theme-muted max-w-xl mb-10"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {subhead}
          </p>
          <div className="flex flex-wrap gap-4">
            <a href={primaryCtaHref} className="btn-primary">
              {primaryCtaLabel}
            </a>
            <a href={secondaryCtaHref} className="btn-secondary">
              {secondaryCtaLabel}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
