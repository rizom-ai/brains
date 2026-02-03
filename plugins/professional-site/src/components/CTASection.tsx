import type { JSX } from "preact";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";
import { type SocialLink, LinkButton } from "@brains/ui-library";

interface CTASectionProps {
  cta: SiteInfoCTA;
  socialLinks?: SocialLink[] | undefined;
}

/**
 * Call-to-action section for homepage
 * Centered layout for clear visual focus
 */
export function CTASection({ cta, socialLinks }: CTASectionProps): JSX.Element {
  return (
    <section className="mt-16 py-16 text-center border-t border-theme">
      <h2 className="text-2xl md:text-3xl font-semibold text-heading mb-6">
        {cta.heading}
      </h2>
      <LinkButton href={cta.buttonLink} variant="primary" size="lg">
        {cta.buttonText}
      </LinkButton>

      {socialLinks && socialLinks.length > 0 && (
        <div className="flex flex-wrap justify-center gap-4 mt-8">
          {socialLinks.map((link, i) => (
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
      )}
    </section>
  );
}
