import type { JSX } from "preact";
import type { CTASection } from "./schema";
import { LinkButton } from "@brains/ui-library";

export const CTALayout = ({
  headline,
  description,
  primaryButton,
  secondaryButton,
}: CTASection): JSX.Element => {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-dark to-brand"></div>
      <div className="absolute inset-0 opacity-10 pointer-events-none cta-bg-pattern"></div>

      <div className="relative max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-theme-inverse mb-6">
          {headline}
        </h2>
        <p className="text-xl md:text-2xl text-theme-inverse/90 mb-10 max-w-3xl mx-auto leading-relaxed">
          {description}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <LinkButton
            href={primaryButton.link}
            variant="unstyled"
            size="2xl"
            className="bg-theme-inverse text-brand-dark font-bold hover:shadow-2xl hover:-translate-y-1"
          >
            {primaryButton.text}
            <svg
              className="ml-2 w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              ></path>
            </svg>
          </LinkButton>
          {secondaryButton && (
            <LinkButton
              href={secondaryButton.link}
              variant="outline-light"
              size="2xl"
            >
              {secondaryButton.text}
              <svg
                className="ml-2 w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                ></path>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
            </LinkButton>
          )}
        </div>
      </div>
    </section>
  );
};
