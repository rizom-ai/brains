import type { JSX } from "preact";
import { LinkButton } from "./LinkButton";
import type { SocialLink } from "./SocialLinks";

export interface CTASectionProps {
  cta: {
    heading: string;
    subtitle?: string | undefined;
    buttonText: string;
    buttonLink: string;
  };
  variant?: "centered" | "editorial";
  socialLinks?: SocialLink[] | undefined;
}

/**
 * Call-to-action section with two variants:
 * - "centered": brand bg, centered text, outline-light button (personal style)
 * - "editorial": subtle bg, left-aligned, overline label, primary button + optional social links
 */
export function CTASection({
  cta,
  variant = "centered",
  socialLinks,
}: CTASectionProps): JSX.Element {
  if (variant === "editorial") {
    return (
      <section className="cta-bg-pattern py-28 md:py-32 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <span className="inline-flex items-center gap-[0.6rem] font-mono text-[0.7rem] font-medium uppercase tracking-[0.22em] text-accent mb-6 before:content-[''] before:w-[18px] before:h-px before:bg-accent">
            Get in touch
          </span>
          <h2 className="font-heading font-normal text-heading leading-[1.05] tracking-[-0.02em] text-[clamp(2.25rem,4.5vw,3.5rem)] max-w-[18ch] mb-10 [font-variation-settings:'opsz'_96,'SOFT'_60]">
            {cta.heading}
          </h2>
          <div className="flex flex-wrap items-center gap-7">
            <a
              href={cta.buttonLink}
              className="inline-flex items-center gap-2 font-mono text-[0.78rem] font-medium uppercase tracking-[0.14em] bg-accent text-theme-inverse px-6 py-[0.95rem] rounded-xl transition-[background,transform] duration-150 hover:bg-[var(--color-text)] hover:-translate-y-px"
            >
              {cta.buttonText}
              <span aria-hidden="true">→</span>
            </a>

            {socialLinks &&
              socialLinks.length > 0 &&
              socialLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[0.72rem] font-medium uppercase tracking-[0.16em] text-theme-muted hover:text-accent transition-colors relative pb-[3px] before:content-[''] before:absolute before:left-0 before:right-full before:bottom-0 before:h-px before:bg-accent before:transition-[right] before:duration-300 hover:before:right-0"
                >
                  {link.label ?? link.platform}
                </a>
              ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="cta-bg-pattern bg-brand py-16 md:py-24 px-6 md:px-12">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-inverse mb-4 font-heading">
          {cta.heading}
        </h2>
        {cta.subtitle && (
          <p className="text-base md:text-lg text-inverse opacity-80 mb-6 max-w-md mx-auto">
            {cta.subtitle}
          </p>
        )}
        <LinkButton href={cta.buttonLink} variant="outline-light" size="lg">
          {cta.buttonText}
        </LinkButton>
      </div>
    </section>
  );
}
