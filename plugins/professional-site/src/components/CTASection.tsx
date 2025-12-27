import type { JSX } from "preact";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";

interface SocialLink {
  platform: string;
  url: string;
  label?: string | undefined;
}

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
      <a
        href={cta.buttonLink}
        className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors font-medium text-lg"
      >
        {cta.buttonText}
      </a>

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
