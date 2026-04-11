import type { JSX } from "preact";
import type { PersonalProfile } from "../schemas";
import { Head, MarkdownContent, LinkButton } from "@brains/ui-library";

export interface AboutPageData {
  profile: PersonalProfile;
}

export const AboutPageLayout = ({ profile }: AboutPageData): JSX.Element => {
  const title = `About ${profile.name}`;
  const description = profile.description ?? profile.intro ?? "About page";

  return (
    <>
      <Head title={title} description={description} ogType="profile" />
      <div className="about-page bg-theme">
        {/* Hero — gradient, matching homepage style */}
        <section className="hero-bg-pattern relative flex flex-col pt-20 pb-[60px] px-6 md:px-12 bg-theme-gradient overflow-hidden">
          <div className="relative z-10 w-full max-w-3xl mx-auto">
            <h1 className="text-2xl sm:text-3xl md:text-[48px] md:leading-[1.15] font-bold text-brand mb-4 font-heading tracking-[-0.03em] text-balance">
              {profile.name}
            </h1>
            {profile.description && (
              <p className="text-lg leading-[1.6] text-theme max-w-2xl">
                {profile.description}
              </p>
            )}
          </div>
        </section>

        {/* Story */}
        {profile.story && (
          <section className="py-[60px] px-6 md:px-12 bg-theme">
            <div className="max-w-3xl mx-auto">
              <MarkdownContent markdown={profile.story} />
            </div>
          </section>
        )}

        {/* Contact */}
        {(profile.email ?? profile.website) && (
          <section className="py-[60px] px-6 md:px-12 bg-theme">
            <div className="max-w-3xl mx-auto flex flex-wrap gap-4">
              {profile.email && (
                <LinkButton href={`mailto:${profile.email}`} variant="primary">
                  Get in Touch
                </LinkButton>
              )}
              {profile.website && (
                <LinkButton href={profile.website} variant="outline">
                  Website
                </LinkButton>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
};
