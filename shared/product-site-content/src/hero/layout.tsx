import type { JSX } from "preact";
import type { LandingHeroData } from "./schema";
import { LinkButton } from "@brains/ui-library";

export const HeroLayout = ({
  headline,
  subheadline,
  ctaText,
  ctaLink,
}: LandingHeroData): JSX.Element => {
  return (
    <section className="hero-section py-20 md:py-32 text-center relative overflow-hidden bg-gradient-to-br from-gradient-start to-gradient-end">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none hero-bg-pattern"></div>

      {/* Floating animated blobs */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-brand-light rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
      <div className="absolute top-40 right-10 w-72 h-72 bg-accent rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-brand rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="container mx-auto px-4 max-w-5xl relative z-10">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-theme">
          {headline}
        </h1>
        <p className="text-xl md:text-2xl text-theme-muted mb-8 max-w-3xl mx-auto">
          {subheadline}
        </p>
        {ctaText && ctaLink && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <LinkButton
              href={ctaLink}
              variant="accent"
              size="xl"
              className="group bg-gradient-to-r from-accent to-accent-dark shadow-lg hover:-translate-y-0.5 hover:shadow-xl"
            >
              {ctaText}
              <svg
                className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform"
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
            <LinkButton
              href="#features"
              variant="outline"
              size="xl"
              className="hover:shadow-lg hover:-translate-y-0.5"
            >
              Learn More
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
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                ></path>
              </svg>
            </LinkButton>
          </div>
        )}
      </div>
    </section>
  );
};
