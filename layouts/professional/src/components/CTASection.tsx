import type { JSX } from "preact";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";
import { type SocialLink, LinkButton } from "@brains/ui-library";

interface CTASectionProps {
  cta: SiteInfoCTA;
  socialLinks?: SocialLink[] | undefined;
}

/**
 * Call-to-action section for homepage
 * Full-width left-aligned layout with overline label
 */
export function CTASection({ cta, socialLinks }: CTASectionProps): JSX.Element {
  return (
    <section className="cta-bg-pattern bg-theme-subtle py-24 md:py-32 px-6 md:px-12">
      <div className="wave-divider absolute top-0 left-0 right-0" />
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
                className="text-theme-muted hover:text-brand transition-colors"
              >
                {link.label || link.platform}
              </a>
            ))}
        </div>
      </div>
    </section>
  );
}
