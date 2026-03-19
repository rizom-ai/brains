import type { JSX } from "preact";
import { LinkButton } from "@brains/ui-library";

interface CTASectionProps {
  heading: string;
  subtitle?: string | undefined;
  buttonText: string;
  buttonLink: string;
}

/**
 * CTA section — centered, full-width with pattern overlay
 * Matches design: brand bg, heading, optional subtitle, outline button
 */
export function CTASection({
  heading,
  subtitle,
  buttonText,
  buttonLink,
}: CTASectionProps): JSX.Element {
  return (
    <section className="cta-bg-pattern bg-brand py-16 md:py-24 px-6 md:px-12">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-theme-inverse mb-4 font-heading">
          {heading}
        </h2>
        {subtitle && (
          <p className="text-base md:text-lg text-theme-inverse opacity-80 mb-6 max-w-md mx-auto">
            {subtitle}
          </p>
        )}
        <LinkButton href={buttonLink} variant="outline-light" size="lg">
          {buttonText}
        </LinkButton>
      </div>
    </section>
  );
}
