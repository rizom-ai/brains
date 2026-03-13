import type { JSX } from "preact";
import type { ProfessionalProfile } from "../schemas";
import {
  Head,
  ProseContent,
  tagVariants,
  LinkButton,
} from "@brains/ui-library";
import { markdownToHtml } from "@brains/utils";

/**
 * About page data structure
 */
export interface AboutPageData {
  profile: ProfessionalProfile;
}

/**
 * About page layout
 * Two-zone design: full-width story prose, then structured metadata grid
 */
export const AboutPageLayout = ({ profile }: AboutPageData): JSX.Element => {
  const title = `About ${profile.name || "Me"}`;
  const description = profile.description || profile.intro || "About page";

  const hasStructuredContent =
    (profile.expertise && profile.expertise.length > 0) ||
    profile.currentFocus ||
    profile.availability ||
    profile.email ||
    profile.website ||
    (profile.socialLinks && profile.socialLinks.length > 0);

  return (
    <>
      <Head title={title} description={description} ogType="profile" />
      <div className="about-page bg-theme">
        {/* Hero Section */}
        <header className="hero-bg-pattern relative w-full py-16 md:py-24 px-6 md:px-12 bg-theme overflow-hidden">
          <div className="relative z-10 max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-semibold mb-6 text-heading">
              About {profile.name || "Me"}
            </h1>
            {profile.description && (
              <p className="text-xl md:text-2xl text-theme-muted leading-relaxed">
                {profile.description}
              </p>
            )}
          </div>
        </header>

        {/* Main Content */}
        <div className="container mx-auto px-6 md:px-12 max-w-4xl py-12 md:py-16">
          {/* Zone 1: Story — Full-width prose, no section heading */}
          {profile.story && (
            <section className="content-section-reveal mb-20 md:mb-28">
              <ProseContent html={markdownToHtml(profile.story)} />
            </section>
          )}

          {/* Zone 2: Structured grid */}
          {hasStructuredContent && (
            <div className="content-section-reveal grid md:grid-cols-2 gap-x-16 gap-y-12">
              {/* Expertise */}
              {profile.expertise && profile.expertise.length > 0 && (
                <section>
                  <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-6">
                    Expertise
                  </h2>
                  <ul className="flex flex-wrap gap-3">
                    {profile.expertise.map((skill, i) => (
                      <li
                        key={i}
                        className={tagVariants({
                          variant: "accent",
                          size: "lg",
                        })}
                      >
                        {skill}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Current Focus */}
              {profile.currentFocus && (
                <section>
                  <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-6">
                    Current Focus
                  </h2>
                  <p className="text-lg text-theme leading-relaxed">
                    {profile.currentFocus}
                  </p>
                </section>
              )}

              {/* Availability */}
              {profile.availability && (
                <section>
                  <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-6">
                    Availability
                  </h2>
                  <p className="text-lg text-theme leading-relaxed">
                    {profile.availability}
                  </p>
                </section>
              )}

              {/* Contact */}
              {(profile.email ||
                profile.website ||
                (profile.socialLinks && profile.socialLinks.length > 0)) && (
                <section>
                  <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-6">
                    Contact
                  </h2>
                  <div className="space-y-4">
                    {profile.email && (
                      <p className="text-lg">
                        <a
                          href={`mailto:${profile.email}`}
                          className="text-brand hover:text-brand-dark transition-colors"
                        >
                          {profile.email}
                        </a>
                      </p>
                    )}
                    {profile.website && (
                      <p className="text-lg">
                        <a
                          href={profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:text-brand-dark transition-colors"
                        >
                          {profile.website}
                        </a>
                      </p>
                    )}
                    {profile.socialLinks && profile.socialLinks.length > 0 && (
                      <div className="flex flex-wrap gap-4 mt-4">
                        {profile.socialLinks.map((link, i) => (
                          <LinkButton
                            key={i}
                            href={link.url}
                            external
                            variant="secondary"
                            size="md"
                          >
                            {link.label || link.platform}
                          </LinkButton>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
