import type { JSX } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";
import { LinkButton, WavyDivider, FooterContent } from "@brains/ui-library";

declare global {
  interface Window {
    toggleTheme?: () => void;
  }
}

export interface FooterCTAProps {
  siteInfo: SiteInfo;
}

export const FooterCTA = ({ siteInfo }: FooterCTAProps): JSX.Element | null => {
  // Return null if no CTA is configured
  if (!siteInfo.cta) return null;

  // Extract CTA values
  const { heading, buttonText, buttonLink } = siteInfo.cta;

  return (
    <div className="relative">
      {/* Wavy line separator above CTA - from Figma design */}
      <WavyDivider />

      <section
        className="relative bg-footer overflow-hidden py-24"
        style={{ marginTop: "-1px" }}
      >
        {/* Left decorative circles */}
        <div className="absolute left-[-200px] bottom-[-150px] w-[600px] h-[600px] opacity-20">
          <div className="absolute inset-0">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 border-2 border-white rounded-full"
                style={{
                  transform: `scale(${1 - i * 0.05})`,
                  opacity: 1 - i * 0.05,
                }}
              />
            ))}
          </div>
        </div>

        {/* Right decorative circles */}
        <div className="absolute right-[-200px] top-0 w-[600px] h-[600px] opacity-20">
          <div className="absolute inset-0">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 border-2 border-white rounded-full"
                style={{
                  transform: `scale(${1 - i * 0.05})`,
                  opacity: 1 - i * 0.05,
                }}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="font-heading font-bold text-white text-7xl leading-tight mb-12">
              {heading}
              <span className="text-accent">.</span>
            </h2>
            <LinkButton
              href={buttonLink}
              size="xl"
              external
              className="bg-white text-accent font-heading font-bold hover:bg-opacity-90 transition-colors"
            >
              {buttonText}
            </LinkButton>
          </div>

          {/* Footer content (navigation, copyright, social links) */}
          <div className="mt-16">
            <FooterContent
              primaryNav={siteInfo.navigation.primary}
              secondaryNav={siteInfo.navigation.secondary}
              copyright={siteInfo.copyright}
              socialLinks={siteInfo.socialLinks}
              showThemeToggle={true}
              variant="cta"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
