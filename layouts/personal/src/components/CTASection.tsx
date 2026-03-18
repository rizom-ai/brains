import type { JSX } from "preact";
import { LinkButton } from "@brains/ui-library";

interface CTASectionProps {
  heading: string;
  buttonText: string;
  buttonLink: string;
}

/**
 * Simple CTA section — centered, full-width
 */
export function CTASection({
  heading,
  buttonText,
  buttonLink,
}: CTASectionProps): JSX.Element {
  return (
    <section className="cta-bg-pattern bg-brand py-16 md:py-24 px-6 md:px-12">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-inverse mb-6 font-heading">
          {heading}
        </h2>
        <LinkButton href={buttonLink} variant="outline-light" size="lg">
          {buttonText}
        </LinkButton>
      </div>
    </section>
  );
}
