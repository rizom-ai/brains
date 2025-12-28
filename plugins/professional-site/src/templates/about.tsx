import type { JSX } from "preact";
import type { ProfessionalProfile } from "../schemas";
import { Head, ProseContent } from "@brains/ui-library";
import { markdownToHtml } from "@brains/utils";

/**
 * About page data structure
 */
export interface AboutPageData {
  profile: ProfessionalProfile;
}

/**
 * About page layout
 * Displays full profile information including story, expertise, and availability
 */
export const AboutPageLayout = ({ profile }: AboutPageData): JSX.Element => {
  const title = `About ${profile.name || "Me"}`;
  const description = profile.description || profile.intro || "About page";

  return (
    <>
      <Head title={title} description={description} ogType="profile" />
      <div className="about-page bg-theme">
        {/* Hero Section */}
        <header className="w-full py-16 md:py-24 px-6 md:px-12 bg-theme">
          <div className="max-w-4xl mx-auto">
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
          {/* Story Section */}
          {profile.story && (
            <section className="mb-16">
              <h2 className="text-2xl font-semibold mb-6 text-heading">
                Story
              </h2>
              <ProseContent html={markdownToHtml(profile.story)} />
            </section>
          )}

          {/* Expertise Section */}
          {profile.expertise && profile.expertise.length > 0 && (
            <section className="mb-16">
              <h2 className="text-2xl font-semibold mb-6 text-heading">
                Expertise
              </h2>
              <ul className="flex flex-wrap gap-3">
                {profile.expertise.map((skill, i) => (
                  <li
                    key={i}
                    className="px-4 py-2 bg-accent/10 text-accent rounded-full text-sm font-medium"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Current Focus Section */}
          {profile.currentFocus && (
            <section className="mb-16">
              <h2 className="text-2xl font-semibold mb-6 text-heading">
                Current Focus
              </h2>
              <p className="text-lg text-theme leading-relaxed">
                {profile.currentFocus}
              </p>
            </section>
          )}

          {/* Availability Section */}
          {profile.availability && (
            <section className="mb-16">
              <h2 className="text-2xl font-semibold mb-6 text-heading">
                Availability
              </h2>
              <p className="text-lg text-theme leading-relaxed">
                {profile.availability}
              </p>
            </section>
          )}

          {/* Contact Section */}
          {(profile.email ||
            profile.website ||
            (profile.socialLinks && profile.socialLinks.length > 0)) && (
            <section className="mb-16">
              <h2 className="text-2xl font-semibold mb-6 text-heading">
                Get in Touch
              </h2>
              <div className="space-y-4">
                {profile.email && (
                  <p className="text-lg">
                    <span className="text-theme-muted">Email: </span>
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
                    <span className="text-theme-muted">Website: </span>
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
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 border border-theme rounded-lg text-theme hover:text-brand hover:border-brand transition-colors"
                      >
                        {link.label || link.platform}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
};
