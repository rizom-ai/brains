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
      <section className="cta-bg-pattern bg-theme-subtle py-24 md:py-32 px-6 md:px-12 relative">
        <div className="section-divider absolute top-0 left-0 right-0" />
        <div className="max-w-4xl mx-auto">
          <p className="text-sm tracking-widest uppercase text-theme-muted mb-4">
            Get in Touch
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold text-heading max-w-2xl mb-10">
            {cta.heading}
          </h2>
          <div className="flex flex-wrap items-center gap-6">
            <LinkButton href={cta.buttonLink} variant="primary" size="lg">
              {cta.buttonText}
            </LinkButton>

            {socialLinks &&
              socialLinks.length > 0 &&
              socialLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-theme-muted hover:text-accent transition-colors relative pb-1 before:content-[''] before:absolute before:left-0 before:right-full before:bottom-0 before:h-px before:bg-accent before:transition-[right] before:duration-300 hover:before:right-0"
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
